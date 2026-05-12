'use strict';

/**
 * Tests for server.js
 *
 * Setup strategy
 * --------------
 * server.js exports { app, server, io } and does NOT call server.listen()
 * when required as a module (require.main === module guard). beforeAll starts
 * it on port 0 (OS-assigned) to avoid clashing with a live dev instance on
 * 3001. afterAll calls io.close() then server.close() in sequence — this is
 * the only ordering that lets Jest exit without --forceExit.
 *
 * State isolation
 * ---------------
 * messageCounts is in-memory and shared for the server's lifetime. Each test
 * uses unique userId pairs so counts never bleed across tests.
 */

const { io: ioc } = require('socket.io-client');
const { server, io } = require('./server');

jest.setTimeout(10_000);

/** @type {string} */
let serverUrl;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves with the first occurrence of `event` on `socket`, or rejects
 * after `ms` milliseconds. Using once() guarantees the listener is removed
 * whether it resolves or times out.
 *
 * @param {import('socket.io-client').Socket} socket
 * @param {string} event
 * @param {number} [ms=3000]
 * @returns {Promise<unknown>}
 */
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

/**
 * Opens a new socket.io-client connection and resolves once the handshake
 * succeeds, or rejects immediately on connect_error (no reconnect attempts).
 *
 * @param {{ userId: string, stakeBalance: number }} auth
 * @returns {Promise<import('socket.io-client').Socket>}
 */
function connectClient(auth) {
  return new Promise((resolve, reject) => {
    const socket = ioc(serverUrl, {
      auth,
      forceNew: true,      // each call gets a dedicated engine connection
      reconnection: false, // do not retry — failures must be deterministic in tests
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
  // Port 0 → OS picks a free port. Retrieve it from server.address() after
  // the 'listening' event so serverUrl is always accurate.
  server.listen(0, () => {
    const { port } = server.address();
    serverUrl = `http://localhost:${port}`;
    done();
  });
});

afterAll((done) => {
  // In Socket.io v4, io.close() closes the underlying HTTP server internally
  // before invoking the callback — calling server.close() afterwards would
  // throw "Server is not running." Passing done directly is sufficient and
  // correct.
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
    // connectClient rejects on connect_error; we assert the error message.
    await expect(
      connectClient({ userId: 'broke-user', stakeBalance: 0 }),
    ).rejects.toThrow('STAKE_INSUFFICIENT');
  });
});

describe('frosted_glass_unlocked event', () => {
  test('fires on both clients on the 15th message, not before, and not again on the 16th', async () => {
    // Unique IDs so this test's message counter starts at 0 regardless of
    // which other tests have already run.
    const clientA = await connectClient({ userId: 'glass-a', stakeBalance: 100 });
    const clientB = await connectClient({ userId: 'glass-b', stakeBalance: 100 });

    // Track cumulative fire count to verify the event is not emitted again
    // after the threshold.
    let fireCountA = 0;
    let fireCountB = 0;
    clientA.on('frosted_glass_unlocked', () => { fireCountA += 1; });
    clientB.on('frosted_glass_unlocked', () => { fireCountB += 1; });

    try {
      // ── Messages 1–14 ──────────────────────────────────────────────────
      // Wait for the sender's echo on each iteration so we know the server
      // has fully processed the message (and incremented its counter) before
      // we check that the unlock event has not yet fired.
      for (let i = 1; i <= 14; i++) {
        const echoPromise = waitForEvent(clientA, 'receiveMessage');
        clientA.emit('sendMessage', { toUserId: 'glass-b', content: `msg-${i}` });

        const echo = await echoPromise;
        expect(echo.messageCount).toBe(i);
      }

      // After 14 messages the unlock must not have fired on either side.
      expect(fireCountA).toBe(0);
      expect(fireCountB).toBe(0);

      // ── Message 15 — unlock must fire on BOTH clients ──────────────────
      // Register the unlock promises BEFORE emitting so the listeners are
      // in place when the server responds.
      const unlockPromiseA = waitForEvent(clientA, 'frosted_glass_unlocked');
      const unlockPromiseB = waitForEvent(clientB, 'frosted_glass_unlocked');

      clientA.emit('sendMessage', { toUserId: 'glass-b', content: 'msg-15' });

      const [payloadA, payloadB] = await Promise.all([unlockPromiseA, unlockPromiseB]);

      // Both payloads must name the same conversation.
      expect(typeof payloadA.conversationKey).toBe('string');
      expect(payloadA.conversationKey).toBe(payloadB.conversationKey);
      expect(typeof payloadA.unlockedAt).toBe('number');

      // Exactly one emission each — the counter listeners above confirm this.
      expect(fireCountA).toBe(1);
      expect(fireCountB).toBe(1);

      // ── Message 16 — unlock must NOT fire again ────────────────────────
      // Wait for the echo to confirm the server processed message 16, then
      // allow a short window for any spurious event to arrive.
      const echo16Promise = waitForEvent(clientA, 'receiveMessage');
      clientA.emit('sendMessage', { toUserId: 'glass-b', content: 'msg-16' });
      const echo16 = await echo16Promise;
      expect(echo16.messageCount).toBe(16);

      // 200 ms is enough for a loopback event to arrive if one were emitted.
      await new Promise((resolve, reject) => {
        const guard = setTimeout(resolve, 200);
        clientA.once('frosted_glass_unlocked', () => {
          clearTimeout(guard);
          reject(new Error('frosted_glass_unlocked fired again on message 16'));
        });
      });

      // Counts unchanged after the 16th message.
      expect(fireCountA).toBe(1);
      expect(fireCountB).toBe(1);
    } finally {
      // Disconnect inside finally so sockets are always cleaned up even if
      // an assertion above throws.
      clientA.disconnect();
      clientB.disconnect();
    }
  });
});
