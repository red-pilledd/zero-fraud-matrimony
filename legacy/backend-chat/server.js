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

const PORT                    = 3001;
const PHOTO_REVEAL_THRESHOLD  = 5;
const COOLDOWN_THRESHOLD      = 100;  // set high for testing (was 10)
const MESSAGES_PER_WINDOW     = 5;    // messages allowed per 5-hour window after first cooldown
const COOLDOWN_DURATION_MS    = 5 * 60 * 60 * 1000;
const MINIMUM_STAKE_TO_INITIATE = 1;
const FASTAPI_BASE            = process.env.FASTAPI_BASE ?? 'http://localhost:8000';

// ---------------------------------------------------------------------------
// Anthropic client
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
// In-memory state  (replace with Redis before horizontal scaling)
// ---------------------------------------------------------------------------

/** userId → active socketId */
const userSockets = new Map();

/** conversationKey → total messages ever delivered */
const messageCounts = new Map();

/** conversationKey → true once verifyPayment succeeds */
const paymentVerifiedSessions = new Map();

/** conversationKey → true when AI sentinel triggers a hard lock */
const chatLockedSessions = new Map();

/** conversationKey → epoch ms when a cooldown period started */
const cooldownSessions = new Map();

/**
 * conversationKey → array of last BUFFER_SIZE messages { userId, content }
 * Used by the background consistency checker.
 */
const messageBuffers = new Map();
const BUFFER_SIZE = 20;
const ANALYSIS_MILESTONES = new Set([10, 20, 30, 40, 50]);

/**
 * conversationKey → { windowStart: number, windowCount: number }
 * Tracks the rolling 5-message window that opens after the first cooldown.
 */
const windowSessions = new Map();


// ---------------------------------------------------------------------------
// AI Sentinel — PII, location, money/pressure detection
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
  'You are a strict safety monitor for a matrimony chat platform. ' +
  'Analyze the message and respond with ONLY one of these three words:\n' +
  'VIOLATION — phone numbers, emails, social media handles, physical addresses, ' +
  'landmarks, GPS coordinates, or any obfuscated version of these.\n' +
  'SUSPICION — requests for money, recharges, loans, gifts, financial help, ' +
  'or pressure/manipulation tactics (ultimatums, guilt-tripping, forcing a call or meeting).\n' +
  'SAFE — none of the above.\n' +
  'One word only. No punctuation. No explanation.';

/**
 * @param {string} content
 * @returns {Promise<'VIOLATION'|'SUSPICION'|'SAFE'>}
 */
async function sentinelAI(content) {
  if (!anthropicClient) return 'SAFE';
  try {
    const response = await anthropicClient.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 64,
      system: SENTINEL_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });
    const raw = response.content[0]?.text?.trim() ?? '';
    if (raw === 'VIOLATION') return 'VIOLATION';
    if (raw === 'SUSPICION') return 'SUSPICION';
    return 'SAFE';
  } catch {
    return 'SAFE'; // fail-open: never drop a real message due to API outage
  }
}

/**
 * Two-stage detection: regex short-circuits for obvious PII before the AI call.
 * @param {string} content
 * @returns {Promise<'VIOLATION'|'SUSPICION'|'SAFE'>}
 */
async function detectContent(content) {
  if (hasPiiRegex(content)) return 'VIOLATION';
  return sentinelAI(content);
}

// ---------------------------------------------------------------------------
// FastAPI callbacks — fire-and-forget, never block message delivery
// ---------------------------------------------------------------------------

/** Permanent ban for PII/address sharing — no threshold, no appeal. */
async function submitInstantBan(userId) {
  try {
    await fetch(`${FASTAPI_BASE}/internal/instant-ban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, reason: 'PII_VIOLATION' }),
    });
  } catch { /* ignore */ }
}

/** Trigger passive profile consistency analysis at message milestones. */
async function triggerConsistencyCheck(userIdA, userIdB, messages) {
  try {
    await fetch(`${FASTAPI_BASE}/internal/analyze-consistency`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id_a: userIdA, user_id_b: userIdB, messages }),
    });
  } catch { /* fire-and-forget */ }
}

// ---------------------------------------------------------------------------
// Cooldown helpers
// ---------------------------------------------------------------------------

/**
 * Emit cooldown_activated to both sides of a conversation.
 * @param {string} key @param {string} recipientSocketId|null
 */
function emitCooldown(key, senderSocket, recipientSocketId) {
  const activatedAt = Date.now();
  cooldownSessions.set(key, activatedAt);
  const payload = {
    conversationKey: key,
    activatedAt,
    expiresAt: activatedAt + COOLDOWN_DURATION_MS,
  };
  senderSocket.emit('cooldown_activated', payload);
  if (recipientSocketId) io.to(recipientSocketId).emit('cooldown_activated', payload);
  console.log(`[cooldown_activated]  key=${key}`);
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** @param {string} a @param {string} b @returns {string} */
function conversationKey(a, b) {
  return [a, b].sort().join(':');
}

// ---------------------------------------------------------------------------
// Stake middleware
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
  //   2. Hard paywall (sentinel-triggered permanent lock)
  //   3. Cooldown / rolling window gate (skipped if payment verified)
  //   4. AI Sentinel — VIOLATION | SUSPICION | SAFE
  //      VIOLATION + !paid → lock chat, payment unlocks it
  //      SUSPICION → instant permanent ban, no appeal
  //   5. Deliver message + increment total count
  //   6. Threshold side-effects:
  //        totalCount === PHOTO_REVEAL_THRESHOLD → frosted_glass_unlocked
  //        totalCount === COOLDOWN_THRESHOLD     → first cooldown (if not paid)
  //        window fills (windowCount === MESSAGES_PER_WINDOW) → next cooldown
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
      const isPaid = paymentVerifiedSessions.get(key) === true;

      // ── Gate 1: Hard paywall ──────────────────────────────────────────────
      if (chatLockedSessions.get(key)) {
        socket.emit('system_warning', {
          code: 'CHAT_LOCKED',
          message: 'Safety/Premium violation detected. Payment required to unlock.',
        });
        return;
      }

      // ── Gate 2: Cooldown / rolling window (skipped for paid) ──────────────
      if (!isPaid) {
        const cooldownStart = cooldownSessions.get(key);
        if (cooldownStart !== undefined) {
          const expiresAt = cooldownStart + COOLDOWN_DURATION_MS;
          if (Date.now() < expiresAt) {
            socket.emit('system_warning', {
              code: 'COOLDOWN_ACTIVE',
              message: 'Message limit reached. Upgrade to Premium to chat instantly, or wait 5 hours.',
              expiresAt,
            });
            return;
          }
          // Cooldown expired — clear it so the next window can begin
          cooldownSessions.delete(key);
        }
      }

      // ── Gate 3: AI Sentinel ───────────────────────────────────────────────
      const sentinelResult = await detectContent(content);

      if (sentinelResult === 'VIOLATION' && !isPaid) {
        // Lock chat until payment — no ban, user can unlock by paying
        chatLockedSessions.set(key, true);
        const blockPayload = { reason: 'Safety/Premium violation detected. Payment required to unlock.' };
        socket.emit('SYSTEM_BLOCK', blockPayload);
        if (recipientSocketId) io.to(recipientSocketId).emit('SYSTEM_BLOCK', blockPayload);
        console.log(`[SYSTEM_BLOCK]  key=${key}  triggeredBy=${userId}`);
        return;
      }

      if (sentinelResult === 'SUSPICION') {
        // Money requests / pressure tactics — instant permanent ban, no appeal
        await submitInstantBan(userId);
        socket.emit('SYSTEM_BLOCK', { reason: 'Your account has been permanently banned for violating community guidelines.' });
        if (recipientSocketId) io.to(recipientSocketId).emit('SYSTEM_BLOCK', { reason: 'This conversation has been locked due to a safety violation.' });
        console.log(`[INSTANT_BAN]  key=${key}  bannedUserId=${userId}  reason=MONEY_OR_PRESSURE`);
        return;
      }

      // ── Deliver message ───────────────────────────────────────────────────
      const newCount = (messageCounts.get(key) ?? 0) + 1;
      messageCounts.set(key, newCount);

      const messagePayload = {
        fromUserId: userId,
        toUserId,
        content,
        messageCount: newCount,
        timestamp: Date.now(),
      };

      if (recipientSocketId) io.to(recipientSocketId).emit('receiveMessage', messagePayload);
      // Confirm to sender with the final messageCount (replaces optimistic message)
      socket.emit('messageSent', messagePayload);

      // ── Persist to FastAPI (fire-and-forget, non-blocking) ────────────────
      fetch(`${FASTAPI_BASE}/messages/${userId}/${toUserId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }).catch(() => { /* ignore — real-time delivery already succeeded */ });

      // ── Update message buffer (for consistency analysis) ─────────────────
      const buf = messageBuffers.get(key) ?? [];
      buf.push({ userId, content });
      if (buf.length > BUFFER_SIZE) buf.shift();
      messageBuffers.set(key, buf);

      // ── Milestone: trigger passive profile consistency check ──────────────
      if (ANALYSIS_MILESTONES.has(newCount)) {
        triggerConsistencyCheck(userId, toUserId, buf);
      }

      // ── Threshold: photo reveal ───────────────────────────────────────────
      if (newCount === PHOTO_REVEAL_THRESHOLD) {
        const unlockPayload = { conversationKey: key, unlockedAt: Date.now() };
        socket.emit('frosted_glass_unlocked', unlockPayload);
        if (recipientSocketId) io.to(recipientSocketId).emit('frosted_glass_unlocked', unlockPayload);
        console.log(`[frosted_glass_unlocked]  key=${key}`);

        // Persist unlock to DB for both directions so it survives navigation/refresh
        fetch(`${FASTAPI_BASE}/relationships/${userId}/${toUserId}/unlock`, { method: 'PATCH' }).catch(() => {});
        fetch(`${FASTAPI_BASE}/relationships/${toUserId}/${userId}/unlock`, { method: 'PATCH' }).catch(() => {});
      }

      // ── Threshold: first cooldown + rolling window management ─────────────
      if (!isPaid) {
        if (newCount === COOLDOWN_THRESHOLD) {
          // First hard stop — no window yet, just fire the cooldown
          emitCooldown(key, socket, recipientSocketId);

        } else if (newCount > COOLDOWN_THRESHOLD) {
          // We're in rolling-window territory
          let win = windowSessions.get(key);

          if (!win) {
            // First message after a cooldown expired — open a fresh window
            win = { windowStart: Date.now(), windowCount: 0 };
            windowSessions.set(key, win);
          }

          win.windowCount += 1;

          if (win.windowCount >= MESSAGES_PER_WINDOW) {
            // Window just filled — trigger the next cooldown and reset window
            windowSessions.delete(key);
            emitCooldown(key, socket, recipientSocketId);
          }
        }
      }

    } catch (err) {
      console.error(`[sendMessage] unhandled error userId=${userId}:`, err);
      socket.emit('error', { code: 'SERVER_ERROR', message: 'An internal error occurred.' });
    }
  });

  // -------------------------------------------------------------------------
  // verifyPayment — clears lock, cooldown, and window; sets paid flag
  // -------------------------------------------------------------------------
  socket.on('verifyPayment', ({ toUserId }) => {
    if (!toUserId || typeof toUserId !== 'string') {
      socket.emit('error', { code: 'INVALID_PAYLOAD', message: 'toUserId is required.' });
      return;
    }

    const key = conversationKey(userId, toUserId);
    chatLockedSessions.delete(key);
    cooldownSessions.delete(key);
    windowSessions.delete(key);
    paymentVerifiedSessions.set(key, true);

    const payload = { conversationKey: key, verifiedAt: Date.now() };
    socket.emit('payment_verified', payload);

    const recipientSocketId = userSockets.get(toUserId);
    if (recipientSocketId) io.to(recipientSocketId).emit('payment_verified', payload);

    console.log(`[verifyPayment]  key=${key}  userId=${userId}`);
  });

  // -------------------------------------------------------------------------
  // Disconnect
  // -------------------------------------------------------------------------
  socket.on('disconnect', (reason) => {
    if (userSockets.get(userId) === socket.id) userSockets.delete(userId);
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
    thresholds: {
      photoReveal: PHOTO_REVEAL_THRESHOLD,
      cooldown: COOLDOWN_THRESHOLD,
      messagesPerWindow: MESSAGES_PER_WINDOW,
    },
  });
});

// ---------------------------------------------------------------------------
// REST: internal — message count query (used by FastAPI flagging endpoint)
// ---------------------------------------------------------------------------

app.get('/internal/message-count', (req, res) => {
  const { userA, userB } = req.query;
  if (!userA || !userB) {
    return res.status(400).json({ error: 'userA and userB query params are required.' });
  }
  const key = conversationKey(String(userA), String(userB));
  res.json({ count: messageCounts.get(key) ?? 0 });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[backend-chat] Socket.io server listening on port ${PORT}`);
  });
}

module.exports = { app, server, io };
