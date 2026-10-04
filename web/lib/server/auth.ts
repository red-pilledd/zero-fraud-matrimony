import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { q, q0 } from './db.ts'
import { AuthError } from './http.ts'
import { DomainError } from '../pg.ts'
import type { User } from '../types.ts'

const COOKIE = 'thuna_session'
const ADMIN_COOKIE = 'thuna_admin'
const MAX_AGE = 60 * 60 * 24 * 60 // 60 days — a phone app, people stay signed in
const ADMIN_MAX_AGE = 60 * 60 * 8

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (32+ characters)')
  return s
}
const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url')

export function encodeToken(obj: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(obj)).toString('base64url')
  return `${payload}.${sign(payload)}`
}
export function decodeToken<T extends { exp: number }>(token: string | undefined): T | null {
  if (!token) return null
  const [payload, mac] = token.split('.')
  if (!payload || !mac) return null
  const a = Buffer.from(mac), b = Buffer.from(sign(payload))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T
    return s.exp > Date.now() ? s : null
  } catch {
    return null
  }
}

type Sess = { uid: number; sv: number; exp: number }

export async function startSession(user: { id: number; session_version: number }) {
  const token = encodeToken({ uid: user.id, sv: user.session_version, exp: Date.now() + MAX_AGE * 1000 })
  ;(await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: MAX_AGE,
  })
}

export async function endSession() {
  ;(await cookies()).delete(COOKIE)
}

/** The signed-in member, or null. A deleted account or a revoked session counts as signed out. */
export async function getUser(): Promise<User | null> {
  const s = decodeToken<Sess>((await cookies()).get(COOKIE)?.value)
  if (!s) return null
  const u = await q0<User>('SELECT * FROM users WHERE id = $1', [s.uid])
  if (!u || u.session_version !== s.sv || u.status === 'DELETED') return null
  if (u.status === 'FROZEN' && u.frozen_until && new Date(u.frozen_until) < new Date()) {
    await q(`UPDATE users SET status = 'ACTIVE', frozen_until = NULL WHERE id = $1 AND status = 'FROZEN'`, [u.id])
    u.status = 'ACTIVE'
    u.frozen_until = null
  }
  // last_active is only used for ranking; a coarse write is enough
  if (Date.now() - new Date(u.last_active_at).getTime() > 5 * 60_000) {
    q('UPDATE users SET last_active_at = now() WHERE id = $1', [u.id]).catch(() => {})
  }
  return u
}

/** For pages. Not signed in → login; unfinished profile → onboarding; banned → notice. */
export async function requireUser(opts: { onboarded?: boolean } = { onboarded: true }): Promise<User> {
  const u = await getUser()
  if (!u) redirect('/login')
  if (u.status === 'BANNED') redirect('/closed')
  if (opts.onboarded !== false && u.onboarding_step !== 'DONE') redirect('/onboarding')
  return u
}

/** For API routes. */
export async function apiUser(opts: { onboarded?: boolean; canAct?: boolean } = {}): Promise<User> {
  const u = await getUser()
  if (!u) throw new AuthError()
  if (u.status === 'BANNED') throw new AuthError('This account has been closed for breaking the rules.')
  if (opts.onboarded && u.onboarding_step !== 'DONE') throw new DomainError('Finish setting up your profile first.')
  if (opts.canAct && u.status === 'FROZEN') {
    const until = u.frozen_until ? new Date(u.frozen_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'later'
    throw new DomainError(`Your account is paused until ${until} because of repeated rule breaks. You can read, but not send.`)
  }
  return u
}

// ---- admin: separate password, separate cookie ----
export async function startAdmin() {
  const token = encodeToken({ admin: true, exp: Date.now() + ADMIN_MAX_AGE * 1000 })
  ;(await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: ADMIN_MAX_AGE,
  })
}
export async function isAdmin(): Promise<boolean> {
  return !!decodeToken<{ admin: boolean; exp: number }>((await cookies()).get(ADMIN_COOKIE)?.value)?.admin
}
export async function requireAdmin() {
  if (!(await isAdmin())) redirect('/admin/login')
}
export async function apiAdmin() {
  if (!(await isAdmin())) throw new AuthError('Admin sign-in required')
}
export async function endAdmin() {
  ;(await cookies()).delete(ADMIN_COOKIE)
}
