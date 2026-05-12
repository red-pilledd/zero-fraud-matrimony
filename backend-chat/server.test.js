'use strict';

/**
 * Tests for server.js
 *
 * Setup strategy
 * --------------
 * server.js exports { app, server, io } and does NOT call server.listen()
 * when required as a module (require.main === module guard). beforeAll starts
 * it on port 0 (OS-assigned) to avoid clashing with a live dev instance on
 * 3001. afterAll calls io.close() — Socket.io v4 closes the HTTP server
 * internally, so no separate server.close() call is needed.
 *
 * State isolation
 * ---------------
 * All in-memory Maps are shared for the server's lifetime. Each test uses
 * unique userId pairs so counts and lock-state never bleed across tests.
 *
 * AI Sentinel
 * -----------
 * No ANTHROPIC_API_KEY is set in the test environment, so anthropicClient is
 * null and hasPiiSemantic() returns false (fail-open). Tests that exercise the
 * hard-paywall path use messages that trip the regex layer instead.
 */

const { io: ioc } = require('socket.io-client');
const { server, io } = require('./server');

jest.setTimeout(10_000);

/** @type {string} */
let serverUrl;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function waitForEvent(socket, event, ms = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout: "${event}" not received within ${ms}ms`)),
      ms,
    );
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function connectClient(auth) {
  return new Promise((resolve, reject) => {
    const socket = ioc(serverUrl, {
      auth,
      forceNew: true,
      reconnection: false,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => {
      socket.disconnect();
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll((done) => {
  server.listen(0, () => {
    const { port } = server.address();
    serverUrl = `http://localhost:${port}`;
    done();
  });
});

afterAll((done) => {
  io.close(done);
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Stake System middleware', () => {
  test('allows connection when stake balance meets the minimum', async () => {
    const client = await connectClient({ userId: 'stake-ok', stakeBalance: 10 });
    expect(client.connected).toBe(true);
    client.disconnect();
  });

  test('rejects connection with STAKE_INSUFFICIENT when balance is 0', async () => {
    await expect(
      connectClient({ userId: 'broke-user', stakeBalance: 0 }),
    ).rejects.toThrow('STAKE_INSUFFICIENT');
  });
});

describe('frosted_glass_unlocked event', () => {
  test('fires on both clients on the 5th message, not before, not again on the 6th', async () => {
    const clientA = await connectClient({ userId: 'glass-a', stakeBalance: 100 });
    const clientB = await connectClient({ userId: 'glass-b', stakeBalance: 100 });

    let fireCountA = 0;
    let fireCountB = 0;
    clientA.on('frosted_glass_unlocked', () => { fireCountA += 1; });
    clientB.on('frosted_glass_unlocked', () => { fireCountB += 1; });

    try {
      // ── Messages 1–4: unlock must NOT fire ────────────────────────────
      for (let i = 1; i <= 4; i++) {
        const echoPromise = waitForEvent(clientA, 'receiveMessage');
        clientA.emit('sendMessage', { toUserId: 'glass-b', content: `msg-${i}` });
        const echo = await echoPromise;
        expect(echo.messageCount).toBe(i);
      }

      expect(fireCountA).toBe(0);
      expect(fireCountB).toBe(0);

      // ── Message 5: unlock must fire on BOTH ───────────────────────────
      const unlockPromiseA = waitForEvent(clientA, 'frosted_glass_unlocked');
      const unlockPromiseB = waitForEvent(clientB, 'frosted_glass_unlocked');

      clientA.emit('sendMessage', { toUserId: 'glass-b', content: 'msg-5' });

      const [payloadA, payloadB] = await Promise.all([unlockPromiseA, unlockPromiseB]);

      expect(typeof payloadA.conversationKey).toBe('string');
      expect(payloadA.conversationKey).toBe(payloadB.conversationKey);
      expect(typeof payloadA.unlockedAt).toBe('number');
      expect(fireCountA).toBe(1);
      expect(fireCountB).toBe(1);

      // ── Message 6: unlock must NOT fire again ─────────────────────────
      const echo6Promise = waitForEvent(clientA, 'receiveMessage');
      clientA.emit('sendMessage', { toUserId: 'glass-b', content: 'msg-6' });
      const echo6 = await echo6Promise;
      expect(echo6.messageCount).toBe(6);

      await new Promise((resolve, reject) => {
        const guard = setTimeout(resolve, 200);
        clientA.once('frosted_glass_unlocked', () => {
          clearTimeout(guard);
          reject(new Error('frosted_glass_unlocked fired again on message 6'));
        });
      });

      expect(fireCountA).toBe(1);
      expect(fireCountB).toBe(1);
    } finally {
      clientA.disconnect();
      clientB.disconnect();
    }
  });
});

describe('AI Sentinel — hard paywall', () => {
  test('chat_locked fires on sender when a regex-detectable phone number is sent', async () => {
    const clientA = await connectClient({ userId: 'pii-sender', stakeBalance: 100 });

    try {
      const warningPromise = waitForEvent(clientA, 'system_warning');
      const lockPromise    = waitForEvent(clientA, 'chat_locked');

      // 10-digit number trips the regex layer without needing the API
      clientA.emit('sendMessage', { toUserId: 'pii-receiver', content: 'Call me on 9876543210' });

      const [warning, lock] = await Promise.all([warningPromise, lockPromise]);

      expect(warning.code).toBe('VIOLATION_DETECTED');
      expect(warning.message).toBe('Safety/Premium violation detected');
      expect(typeof lock.conversationKey).toBe('string');
      expect(typeof lock.lockedAt).toBe('number');

      // Subsequent message is blocked with the CHAT_LOCKED code
      const nextWarning = waitForEvent(clientA, 'system_warning');
      clientA.emit('sendMessage', { toUserId: 'pii-receiver', content: 'clean message' });
      const blocked = await nextWarning;
      expect(blocked.code).toBe('CHAT_LOCKED');
      expect(blocked.message).toBe('Safety/Premium violation detected');
    } finally {
      clientA.disconnect();
    }
  });
});

describe('Cooldown Paywall', () => {
  test('cooldown_activated fires on both clients after the 10th message', async () => {
    const clientA = await connectClient({ userId: 'cool-a', stakeBalance: 100 });
    const clientB = await connectClient({ userId: 'cool-b', stakeBalance: 100 });

    try {
      // Send messages 1–9 without triggering cooldown
      for (let i = 1; i <= 9; i++) {
        const echoPromise = waitForEvent(clientA, 'receiveMessage');
        clientA.emit('sendMessage', { toUserId: 'cool-b', content: `msg-${i}` });
        await echoPromise;
      }

      // Message 10 triggers cooldown on both
      const cooldownA = waitForEvent(clientA, 'cooldown_activated');
      const cooldownB = waitForEvent(clientB, 'cooldown_activated');

      clientA.emit('sendMessage', { toUserId: 'cool-b', content: 'msg-10' });

      const [payloadA, payloadB] = await Promise.all([cooldownA, cooldownB]);

      expect(payloadA.conversationKey).toBe(payloadB.conversationKey);
      expect(typeof payloadA.activatedAt).toBe('number');
      expect(typeof payloadA.expiresAt).toBe('number');
      expect(payloadA.expiresAt - payloadA.activatedAt).toBe(5 * 60 * 60 * 1000);

      // Message 11 is blocked
      const warningPromise = waitForEvent(clientA, 'system_warning');
      clientA.emit('sendMessage', { toUserId: 'cool-b', content: 'msg-11' });
      const warning = await warningPromise;
      expect(warning.code).toBe('COOLDOWN_ACTIVE');
      expect(warning.message).toBe('Cooldown active');
    } finally {
      clientA.disconnect();
      clientB.disconnect();
    }
  });
});
