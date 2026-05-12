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

const FROSTED_GLASS_THRESHOLD = 15;
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
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// ---------------------------------------------------------------------------
// In-memory state
// NOTE: Replace all stores with Redis before horizontal scaling.
// ---------------------------------------------------------------------------

/** Maps a userId to the socket.id of their active connection. @type {Map<string, string>} */
const userSockets = new Map();

/** Tracks messages exchanged per conversation — solely for Frosted Glass. @type {Map<string, number>} */
const messageCounts = new Map();

/** Tracks payment verification per conversation. @type {Map<string, boolean>} */
const paymentVerifiedSessions = new Map();

// ---------------------------------------------------------------------------
// PII detection
// ---------------------------------------------------------------------------

/**
 * Regex-based PII patterns.
 * Short-circuits before the (slower) AI semantic check when a match is found.
 */
const PII_PATTERNS = [
  /\b\d{10}\b/,                                                    // 10-digit phone
  /\b(\+91|0091|91)?[-\s]?\d{5}[-\s]?\d{5}\b/,                   // Indian mobile
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/,           // email
  /@[a-zA-Z0-9_.]{2,}/,                                           // @handle
  /\b(wa\.me|t\.me|instagram\.com|snapchat\.com|telegram\.me)\b/i, // messaging links
  /\b[2-9]{1}[0-9]{3}[\s]?[0-9]{4}[\s]?[0-9]{4}\b/,             // Aadhaar-like (12 digits)
];

/** @param {string} content @returns {boolean} */
function hasPiiRegex(content) {
  return PII_PATTERNS.some((pattern) => pattern.test(content));
}

/**
 * AI semantic PII check using claude-haiku-4-5 for binary classification.
 * Fail-open: returns false on any error so legitimate messages are never
 * dropped due to an API outage.
 *
 * @param {string} content
 * @returns {Promise<boolean>}
 */
async function hasPiiSemantic(content) {
  if (!anthropicClient) return false;

  try {
    const response = await anthropicClient.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 16,
      messages: [
        {
          role: 'user',
          content:
            `Does the following message contain personal contact information such as ` +
            `phone numbers, email addresses, social media handles, messaging app links, ` +
            `or government ID numbers? Reply with exactly one word: YES or NO.\n\nMessage: ${content}`,
        },
      ],
    });

    const reply = response.content[0]?.text?.trim().toUpperCase() ?? '';
    return reply === 'YES';
  } catch {
    return false; // fail-open
  }
}

/**
 * Two-stage PII detection: regex first (sync, fast), then AI (async, semantic).
 * The regex short-circuits so AI is only called when regex passes.
 *
 * @param {string} content
 * @returns {Promise<boolean>}
 */
async function detectPii(content) {
  if (hasPiiRegex(content)) return true;
  return hasPiiSemantic(content);
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Returns a stable, order-independent key for the conversation between two users.
 * @param {string} userA
 * @param {string} userB
 * @returns {string}
 */
function conversationKey(userA, userB) {
  return [userA, userB].sort().join(':');
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
  // Event: sendMessage
  //
  // Payload: { toUserId: string, content: string }
  //
  // Business rules:
  //   1. Run PII detection (regex + AI) on every message.
  //   2. If PII detected and payment not verified → block + emit system_warning.
  //   3. Increment the per-conversation message count.
  //   4. Deliver the message to the recipient (if online) and echo to sender.
  //   5. When the count reaches FROSTED_GLASS_THRESHOLD, emit
  //      'frosted_glass_unlocked' to BOTH participants exactly once.
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

      // ----- PII Shield (runs on every message, independent of message count) -----
      const piiDetected = await detectPii(content);
      if (piiDetected && !paymentVerifiedSessions.get(key)) {
        socket.emit('system_warning', {
          code: 'PII_BLOCKED',
          message: 'Premium Feature: Payment is required to share contact details or social handles.',
        });
        return;
      }

      // ----- Message delivery -----
      const newCount = (messageCounts.get(key) ?? 0) + 1;
      messageCounts.set(key, newCount);

      const messagePayload = {
        fromUserId: userId,
        toUserId,
        content,
        messageCount: newCount,
        timestamp: Date.now(),
      };

      const recipientSocketId = userSockets.get(toUserId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('receiveMessage', messagePayload);
      }

      socket.emit('receiveMessage', messagePayload);

      // ----- Frosted Glass unlock (solely triggered by message count) -----
      if (newCount === FROSTED_GLASS_THRESHOLD) {
        const unlockPayload = {
          conversationKey: key,
          unlockedAt: Date.now(),
        };

        socket.emit('frosted_glass_unlocked', unlockPayload);

        if (recipientSocketId) {
          io.to(recipientSocketId).emit('frosted_glass_unlocked', unlockPayload);
        }

        console.log(`[frosted_glass_unlocked] key=${key}`);
      }
    } catch (err) {
      console.error(`[sendMessage] unhandled error for userId=${userId}:`, err);
      socket.emit('error', { code: 'SERVER_ERROR', message: 'An internal error occurred.' });
    }
  });

  // -------------------------------------------------------------------------
  // Event: verifyPayment
  //
  // Placeholder — in production, validate a payment token/receipt against the
  // FastAPI backend before setting this flag. Once verified, PII sharing is
  // permitted for the lifetime of the in-memory session.
  //
  // Payload: { toUserId: string, paymentToken: string }
  // -------------------------------------------------------------------------
  socket.on('verifyPayment', ({ toUserId }) => {
    if (!toUserId || typeof toUserId !== 'string') {
      socket.emit('error', { code: 'INVALID_PAYLOAD', message: 'toUserId is required.' });
      return;
    }

    const key = conversationKey(userId, toUserId);
    paymentVerifiedSessions.set(key, true);

    socket.emit('payment_verified', { conversationKey: key, verifiedAt: Date.now() });
    console.log(`[verifyPayment] key=${key} userId=${userId}`);
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
  res.json({ status: 'ok', service: 'backend-chat', port: PORT });
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
