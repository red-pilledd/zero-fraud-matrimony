'use strict';

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PORT = 3001;
const PHOTO_REVEAL_THRESHOLD  = 5;                      // frosted_glass_unlocked
const COOLDOWN_THRESHOLD      = 10;                     // 5-hour cooldown activates
const COOLDOWN_DURATION_MS    = 5 * 60 * 60 * 1000;    // 5 hours in ms
const MINIMUM_STAKE_TO_INITIATE = 1;

// ---------------------------------------------------------------------------
// Anthropic client (null when ANTHROPIC_API_KEY is absent — skips AI check)
// ---------------------------------------------------------------------------

const anthropicClient = process.env.ANTHROPIC_API_KEY
  ? new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// ---------------------------------------------------------------------------
// Express + Socket.io bootstrap
// ---------------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ---------------------------------------------------------------------------
// In-memory state
// NOTE: Replace all stores with Redis before horizontal scaling.
// ---------------------------------------------------------------------------

/** userId → active socketId. @type {Map<string, string>} */
const userSockets = new Map();

/** conversationKey → total messages delivered (drives both thresholds). @type {Map<string, number>} */
const messageCounts = new Map();

/** conversationKey → true once verifyPayment succeeds. @type {Map<string, boolean>} */
const paymentVerifiedSessions = new Map();

/** conversationKey → true when AI sentinel trips the hard paywall. @type {Map<string, boolean>} */
const chatLockedSessions = new Map();

/** conversationKey → epoch ms when the 5-hour cooldown began. @type {Map<string, number>} */
const cooldownSessions = new Map();

// ---------------------------------------------------------------------------
// AI Sentinel — PII + physical address / location detection
// ---------------------------------------------------------------------------

const PII_PATTERNS = [
  /\b\d{10}\b/,
  /\b(\+91|0091|91)?[-\s]?\d{5}[-\s]?\d{5}\b/,
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/,
  /@[a-zA-Z0-9_.]{2,}/,
  /\b(wa\.me|t\.me|instagram\.com|snapchat\.com|telegram\.me)\b/i,
  /\b[2-9]{1}[0-9]{3}[\s]?[0-9]{4}[\s]?[0-9]{4}\b/,
];

/** @param {string} content @returns {boolean} */
function hasPiiRegex(content) {
  return PII_PATTERNS.some((p) => p.test(content));
}

const SENTINEL_SYSTEM_PROMPT =
  'You are a strict safety and PII detection engine. Analyze the text for: ' +
  '(1) any obfuscated phone numbers, emails, or social media handles ' +
  '(e.g., spelled-out numbers, spaced-out digits, missing @ symbols, letter-number replacements); ' +
  '(2) physical addresses or location meeting points ' +
  '(e.g., street addresses, landmarks, neighbourhoods, GPS coordinates, ' +
  'or any suggestion to meet at a specific physical place). ' +
  'Respond ONLY with a valid JSON object: {"pii_detected": true/false}';

/**
 * Semantic bypass-detection via claude-3-haiku-20240307.
 * Fail-open: returns false on API error or malformed JSON so real messages
 * are never silently dropped due to an outage.
 * @param {string} content @returns {Promise<boolean>}
 */
async function hasPiiSemantic(content) {
  if (!anthropicClient) return false;
  try {
    const response = await anthropicClient.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 64,
      system: SENTINEL_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });
    const raw = response.content[0]?.text?.trim() ?? '';
    const parsed = JSON.parse(raw);
    return parsed.pii_detected === true;
  } catch {
    return false;
  }
}

/**
 * Two-stage detection: regex short-circuits before the AI call.
 * @param {string} content @returns {Promise<boolean>}
 */
async function detectViolation(content) {
  if (hasPiiRegex(content)) return true;
  return hasPiiSemantic(content);
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** @param {string} a @param {string} b @returns {string} */
function conversationKey(a, b) {
  return [a, b].sort().join(':');
}

// ---------------------------------------------------------------------------
// Stake System middleware
// ---------------------------------------------------------------------------

io.use((socket, next) => {
  const { userId, stakeBalance } = socket.handshake.auth;

  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    return next(new Error('AUTH_MISSING_USER_ID'));
  }

  const balance = typeof stakeBalance === 'number' ? stakeBalance : 0;
  if (balance < MINIMUM_STAKE_TO_INITIATE) {
    return next(new Error('STAKE_INSUFFICIENT'));
  }

  socket.data.userId = userId.trim();
  socket.data.stakeBalance = balance;
  next();
});

// ---------------------------------------------------------------------------
// Connection handler
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  const { userId } = socket.data;
  userSockets.set(userId, socket.id);
  console.log(`[connect]    userId=${userId}  socketId=${socket.id}`);

  // -------------------------------------------------------------------------
  // sendMessage
  //
  // Gate order:
  //   1. Payload validation
  //   2. Hard paywall (chatLockedSessions) — set by AI sentinel on violation
  //   3. Cooldown gate (cooldownSessions)  — set at COOLDOWN_THRESHOLD messages
  //   4. AI Sentinel — detects PII + addresses on every message
  //      → violation + !paymentVerified → lock chat for both users
  //   5. Deliver message + increment count
  //   6. Threshold side-effects:
  //      count === PHOTO_REVEAL_THRESHOLD  → frosted_glass_unlocked
  //      count === COOLDOWN_THRESHOLD      → cooldown_activated
  // -------------------------------------------------------------------------
  socket.on('sendMessage', async ({ toUserId, content }) => {
    try {
      if (!toUserId || typeof toUserId !== 'string' || !content || typeof content !== 'string') {
        socket.emit('error', { code: 'INVALID_PAYLOAD', message: 'toUserId and content are required strings.' });
        return;
      }

      if (toUserId === userId) {
        socket.emit('error', { code: 'CANNOT_MESSAGE_SELF' });
        return;
      }

      const key = conversationKey(userId, toUserId);
      const recipientSocketId = userSockets.get(toUserId);

      // ── Gate 1: Hard paywall ────────────────────────────────────────────
      if (chatLockedSessions.get(key)) {
        socket.emit('system_warning', {
          code: 'CHAT_LOCKED',
          message: 'Safety/Premium violation detected',
        });
        return;
      }

      // ── Gate 2: Cooldown ────────────────────────────────────────────────
      const cooldownStart = cooldownSessions.get(key);
      if (cooldownStart !== undefined) {
        const expiresAt = cooldownStart + COOLDOWN_DURATION_MS;
        if (Date.now() < expiresAt) {
          socket.emit('system_warning', {
            code: 'COOLDOWN_ACTIVE',
            message: 'Cooldown active',
          });
          return;
        }
        // Cooldown has expired — clear it and allow the message
        cooldownSessions.delete(key);
      }

      // ── Gate 3: AI Sentinel ─────────────────────────────────────────────
      const violationDetected = await detectViolation(content);
      if (violationDetected && !paymentVerifiedSessions.get(key)) {
        chatLockedSessions.set(key, true);
        const lockPayload = { conversationKey: key, lockedAt: Date.now() };

        socket.emit('system_warning', {
          code: 'VIOLATION_DETECTED',
          message: 'Safety/Premium violation detected',
        });
        socket.emit('chat_locked', lockPayload);

        if (recipientSocketId) {
          io.to(recipientSocketId).emit('chat_locked', lockPayload);
        }

        console.log(`[chat_locked]  key=${key}  triggeredBy=${userId}`);
        return;
      }

      // ── Deliver message ─────────────────────────────────────────────────
      const newCount = (messageCounts.get(key) ?? 0) + 1;
      messageCounts.set(key, newCount);

      const messagePayload = {
        fromUserId: userId,
        toUserId,
        content,
        messageCount: newCount,
        timestamp: Date.now(),
      };

      if (recipientSocketId) {
        io.to(recipientSocketId).emit('receiveMessage', messagePayload);
      }
      socket.emit('receiveMessage', messagePayload);

      // ── Threshold: photo reveal ─────────────────────────────────────────
      if (newCount === PHOTO_REVEAL_THRESHOLD) {
        const unlockPayload = { conversationKey: key, unlockedAt: Date.now() };
        socket.emit('frosted_glass_unlocked', unlockPayload);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('frosted_glass_unlocked', unlockPayload);
        }
        console.log(`[frosted_glass_unlocked]  key=${key}`);
      }

      // ── Threshold: cooldown ─────────────────────────────────────────────
      if (newCount === COOLDOWN_THRESHOLD) {
        const activatedAt = Date.now();
        cooldownSessions.set(key, activatedAt);
        const cooldownPayload = {
          conversationKey: key,
          activatedAt,
          expiresAt: activatedAt + COOLDOWN_DURATION_MS,
        };
        socket.emit('cooldown_activated', cooldownPayload);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('cooldown_activated', cooldownPayload);
        }
        console.log(`[cooldown_activated]  key=${key}`);
      }
    } catch (err) {
      console.error(`[sendMessage] unhandled error userId=${userId}:`, err);
      socket.emit('error', { code: 'SERVER_ERROR', message: 'An internal error occurred.' });
    }
  });

  // -------------------------------------------------------------------------
  // verifyPayment — clears both the hard lock and the cooldown, then sets the
  // payment-verified flag so PII is permitted going forward.
  // Payload: { toUserId: string, paymentToken: string }
  // -------------------------------------------------------------------------
  socket.on('verifyPayment', ({ toUserId }) => {
    if (!toUserId || typeof toUserId !== 'string') {
      socket.emit('error', { code: 'INVALID_PAYLOAD', message: 'toUserId is required.' });
      return;
    }

    const key = conversationKey(userId, toUserId);
    chatLockedSessions.delete(key);
    cooldownSessions.delete(key);
    paymentVerifiedSessions.set(key, true);

    const payload = { conversationKey: key, verifiedAt: Date.now() };
    socket.emit('payment_verified', payload);

    const recipientSocketId = userSockets.get(toUserId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('payment_verified', payload);
    }

    console.log(`[verifyPayment]  key=${key}  userId=${userId}`);
  });

  // -------------------------------------------------------------------------
  // Disconnect
  // -------------------------------------------------------------------------
  socket.on('disconnect', (reason) => {
    if (userSockets.get(userId) === socket.id) {
      userSockets.delete(userId);
    }
    console.log(`[disconnect] userId=${userId}  reason=${reason}`);
  });
});

// ---------------------------------------------------------------------------
// REST: health check
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'backend-chat',
    port: PORT,
    thresholds: { photoReveal: PHOTO_REVEAL_THRESHOLD, cooldown: COOLDOWN_THRESHOLD },
  });
});

// ---------------------------------------------------------------------------
// Start (only when run directly; not when required by tests)
// ---------------------------------------------------------------------------

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[backend-chat] Socket.io server listening on port ${PORT}`);
  });
}

module.exports = { app, server, io };
