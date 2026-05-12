'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PORT = 3001;

/**
 * Number of messages exchanged between two users that triggers the
 * Frosted Glass unlock. Mirrors the threshold enforced in ProfileCard.tsx.
 */
const FROSTED_GLASS_THRESHOLD = 15;

/**
 * Minimum stake balance (tokens) required to initiate a new conversation.
 * When the Stake System is fully wired, this check will debit the balance
 * via the FastAPI /admin/users/{id} PATCH endpoint.
 */
const MINIMUM_STAKE_TO_INITIATE = 1;

// ---------------------------------------------------------------------------
// Express + Socket.io bootstrap
// ---------------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*', // tighten to mobile app origin in production
    methods: ['GET', 'POST'],
  },
});

// ---------------------------------------------------------------------------
// In-memory state
// NOTE: Replace both stores with Redis before horizontal scaling.
// ---------------------------------------------------------------------------

/**
 * Maps a userId to the socket.id of their active connection.
 * Last-write wins — a reconnect simply overwrites the previous entry.
 * @type {Map<string, string>}
 */
const userSockets = new Map();

/**
 * Tracks the total number of messages exchanged per conversation.
 * Key: canonical conversation key (see conversationKey()).
 * Value: integer message count.
 * @type {Map<string, number>}
 */
const messageCounts = new Map();

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Returns a stable, order-independent key for the conversation between
 * two users so that userA→userB and userB→userA map to the same entry.
 *
 * @param {string} userA
 * @param {string} userB
 * @returns {string}  e.g. "42:99"
 */
function conversationKey(userA, userB) {
  return [userA, userB].sort().join(':');
}

// ---------------------------------------------------------------------------
// Stake System middleware (placeholder)
// ---------------------------------------------------------------------------

/**
 * Socket.io connection-level middleware enforcing the Stake System.
 *
 * Expected handshake.auth shape:
 *   { userId: string, stakeBalance: number }
 *
 * Production replacement:
 *   const user = await fetch(`http://backend-core/users/${userId}`).json();
 *   if (user.stake_balance < MINIMUM_STAKE_TO_INITIATE) { ... }
 *
 * Errors emitted:
 *   AUTH_MISSING_USER_ID  — no userId in auth payload
 *   STAKE_INSUFFICIENT    — balance below minimum required to start a chat
 */
io.use((socket, next) => {
  const { userId, stakeBalance } = socket.handshake.auth;

  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    return next(new Error('AUTH_MISSING_USER_ID'));
  }

  // Coerce missing balance to 0 so the guard always runs.
  const balance = typeof stakeBalance === 'number' ? stakeBalance : 0;

  if (balance < MINIMUM_STAKE_TO_INITIATE) {
    return next(new Error('STAKE_INSUFFICIENT'));
  }

  // Attach validated identity to the socket for use in event handlers.
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
  //   1. Increment the per-conversation message count.
  //   2. Deliver the message to the recipient (if online) and echo to sender.
  //   3. When the count reaches FROSTED_GLASS_THRESHOLD, emit
  //      'frosted_glass_unlocked' to BOTH participants exactly once.
  //
  // Intent-silo enforcement:
  //   In production, verify that socket.data.intentSilo === recipient silo
  //   by calling the FastAPI /users/{toUserId} endpoint. Users in different
  //   silos (MATRIMONY vs ALTERNATIVE) must never be able to message each
  //   other — this is a Zero-Fraud platform directive.
  // -------------------------------------------------------------------------
  socket.on('sendMessage', ({ toUserId, content }) => {
    if (!toUserId || typeof toUserId !== 'string' || !content || typeof content !== 'string') {
      socket.emit('error', { code: 'INVALID_PAYLOAD', message: 'toUserId and content are required strings.' });
      return;
    }

    if (toUserId === userId) {
      socket.emit('error', { code: 'CANNOT_MESSAGE_SELF' });
      return;
    }

    const key = conversationKey(userId, toUserId);
    const newCount = (messageCounts.get(key) ?? 0) + 1;
    messageCounts.set(key, newCount);

    /** @type {{ fromUserId: string, toUserId: string, content: string, messageCount: number, timestamp: number }} */
    const messagePayload = {
      fromUserId: userId,
      toUserId,
      content,
      messageCount: newCount,
      timestamp: Date.now(),
    };

    // Deliver to recipient if they are currently connected.
    const recipientSocketId = userSockets.get(toUserId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('receiveMessage', messagePayload);
    }

    // Always echo back to sender so the client can render its own message
    // with the server-authoritative count and timestamp.
    socket.emit('receiveMessage', messagePayload);

    // ----- Frosted Glass unlock -----
    // Fires exactly once: when the count crosses the threshold (=== not >=)
    // so repeated messages beyond 15 do not re-emit the event.
    if (newCount === FROSTED_GLASS_THRESHOLD) {
      /** @type {{ conversationKey: string, unlockedAt: number }} */
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
  });

  // -------------------------------------------------------------------------
  // Disconnect: clean up the userId → socketId mapping so stale socket IDs
  // are never used as message targets.
  // -------------------------------------------------------------------------
  socket.on('disconnect', (reason) => {
    // Only delete if this socket is still the active one for the user.
    // A rapid reconnect may have already overwritten the entry.
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
// Start
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`[backend-chat] Socket.io server listening on port ${PORT}`);
});
