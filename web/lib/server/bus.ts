import 'server-only'

// In-process fan-out for live updates (Server-Sent Events). The database stays the source of truth:
// a client that misses an event re-fetches on reconnect, so losing an event is never data loss.
// Single-instance by design; a multi-instance deploy would swap this for Postgres LISTEN/NOTIFY.

export type BusEvent =
  | { type: 'message'; conversationId: number }
  | { type: 'conversation'; conversationId: number }
  | { type: 'questions' }
  | { type: 'account' }

type Listener = (e: BusEvent) => void

declare global {
  var __thunaBus: Map<number, Set<Listener>> | undefined
}
const listeners: Map<number, Set<Listener>> = globalThis.__thunaBus ?? new Map()
globalThis.__thunaBus = listeners

export function subscribe(userId: number, fn: Listener): () => void {
  let set = listeners.get(userId)
  if (!set) listeners.set(userId, (set = new Set()))
  set.add(fn)
  return () => {
    set!.delete(fn)
    if (set!.size === 0) listeners.delete(userId)
  }
}

export function publish(userId: number, e: BusEvent) {
  for (const fn of listeners.get(userId) ?? []) {
    try { fn(e) } catch { /* a dead stream must not break the sender */ }
  }
}

export const isOnline = (userId: number) => (listeners.get(userId)?.size ?? 0) > 0
