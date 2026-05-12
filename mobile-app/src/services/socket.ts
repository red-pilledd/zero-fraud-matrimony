import { io, Socket } from 'socket.io-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of every message delivered by the server. */
export interface ServerMessage {
  fromUserId: string;
  toUserId: string;
  content: string;
  messageCount: number;
  timestamp: number;
}

/** Payload emitted when the Frosted Glass threshold is reached. */
export interface FrostedGlassUnlockedPayload {
  conversationKey: string;
  unlockedAt: number;
}

/** Events the server can emit to this client. */
export interface ServerToClientEvents {
  receiveMessage: (msg: ServerMessage) => void;
  frosted_glass_unlocked: (payload: FrostedGlassUnlockedPayload) => void;
  error: (err: { code: string; message?: string }) => void;
}

/** Events this client can emit to the server. */
export interface ClientToServerEvents {
  sendMessage: (payload: { toUserId: string; content: string }) => void;
}

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// ---------------------------------------------------------------------------
// Singleton socket — one connection for the app's lifetime.
// Replace the URL with an environment variable / config when deploying.
// ---------------------------------------------------------------------------

const CHAT_SERVER_URL = 'http://localhost:3001';

let _socket: AppSocket | null = null;

/**
 * Returns the singleton socket, creating it on the first call.
 *
 * @param userId      Authenticated user's ID — sent as handshake auth.
 * @param stakeBalance Current token balance — validated by the server's
 *                     Stake System middleware before the connection is admitted.
 */
export function getSocket(userId: string, stakeBalance: number): AppSocket {
  if (_socket) return _socket;

  _socket = io(CHAT_SERVER_URL, {
    auth: { userId, stakeBalance },
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    autoConnect: true,
  }) as AppSocket;

  return _socket;
}

/** Disconnect and clear the singleton (call on logout). */
export function disconnectSocket(): void {
  _socket?.disconnect();
  _socket = null;
}
