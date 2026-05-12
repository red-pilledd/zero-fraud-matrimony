import { io, Socket } from 'socket.io-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServerMessage {
  fromUserId: string;
  toUserId: string;
  content: string;
  messageCount: number;
  timestamp: number;
}

export interface FrostedGlassUnlockedPayload {
  conversationKey: string;
  unlockedAt: number;
}

export interface SystemWarningPayload {
  code: string;
  message: string;
}

export interface ChatLockedPayload {
  conversationKey: string;
  lockedAt: number;
}

export interface CooldownActivatedPayload {
  conversationKey: string;
  activatedAt: number;
  expiresAt: number;
}

export interface PaymentVerifiedPayload {
  conversationKey: string;
  verifiedAt: number;
}

export interface ServerToClientEvents {
  receiveMessage:        (msg: ServerMessage) => void;
  frosted_glass_unlocked:(payload: FrostedGlassUnlockedPayload) => void;
  system_warning:        (payload: SystemWarningPayload) => void;
  chat_locked:           (payload: ChatLockedPayload) => void;
  cooldown_activated:    (payload: CooldownActivatedPayload) => void;
  payment_verified:      (payload: PaymentVerifiedPayload) => void;
  error:                 (err: { code: string; message?: string }) => void;
}

export interface ClientToServerEvents {
  sendMessage:   (payload: { toUserId: string; content: string }) => void;
  verifyPayment: (payload: { toUserId: string; paymentToken?: string }) => void;
}

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// ---------------------------------------------------------------------------
// Singleton socket — one connection for the app's lifetime.
// ---------------------------------------------------------------------------

const CHAT_SERVER_URL = 'http://192.168.68.114:3001';

let _socket: AppSocket | null = null;

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

export function disconnectSocket(): void {
  _socket?.disconnect();
  _socket = null;
}
