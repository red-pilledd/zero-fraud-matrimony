import 'server-only'
import { createHash, randomInt } from 'node:crypto'
import { q, q0 } from './db.ts'
import { DomainError } from '../pg.ts'

// Phone sign-in. Production sends the code by SMS through MSG91 (Indian DLT-registered route).
// Without MSG91 keys and outside production, the code is shown on screen so the flow can be tested.

const hash = (phone: string, code: string) =>
  createHash('sha256').update(`${phone}:${code}:${process.env.SESSION_SECRET}`).digest('hex')

export function normalisePhone(raw: string): string {
  const d = raw.replace(/\D/g, '')
  const ten = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d
  if (!/^[6-9]\d{9}$/.test(ten)) throw new DomainError('Enter a valid 10-digit Indian mobile number')
  return `+91${ten}`
}

export const smsMode = (): 'MSG91' | 'DEV' | 'NONE' =>
  process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID ? 'MSG91'
    : process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_OTP === '1' ? 'DEV' : 'NONE'

export async function sendOtp(phone: string, ip: string): Promise<{ devCode?: string }> {
  const recent = await q0<{ by_phone: string; by_ip: string }>(
    `SELECT COUNT(*) FILTER (WHERE phone = $1) AS by_phone, COUNT(*) FILTER (WHERE ip = $2) AS by_ip
       FROM otp_codes WHERE created_at > now() - interval '15 minutes'`, [phone, ip])
  if (Number(recent?.by_phone) >= 3) throw new DomainError('Too many codes requested. Wait 15 minutes and try again.')
  if (Number(recent?.by_ip) >= 15) throw new DomainError('Too many requests from this network. Try again later.')
  const mode = smsMode()
  if (mode === 'NONE') throw new DomainError('Sign-in by SMS is not available right now.')
  const code = String(randomInt(100000, 1000000))
  await q(`INSERT INTO otp_codes (phone, code_hash, ip, expires_at) VALUES ($1,$2,$3, now() + interval '10 minutes')`, [phone, hash(phone, code), ip])
  if (mode === 'DEV') {
    console.log(`[otp] ${phone} → ${code}`)
    return { devCode: code }
  }
  const url = new URL('https://control.msg91.com/api/v5/otp')
  url.searchParams.set('template_id', process.env.MSG91_TEMPLATE_ID!)
  url.searchParams.set('mobile', phone.replace('+', ''))
  url.searchParams.set('otp', code)
  const res = await fetch(url, { method: 'POST', headers: { authkey: process.env.MSG91_AUTH_KEY!, 'content-type': 'application/json' }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) {
    console.error('[otp] MSG91 failed', res.status, await res.text())
    throw new DomainError('Could not send the code. Try again in a minute.')
  }
  return {}
}

export async function checkOtp(phone: string, code: string): Promise<boolean> {
  const row = await q0<{ id: number; code_hash: string; attempts: number }>(
    `SELECT id, code_hash, attempts FROM otp_codes WHERE phone = $1 AND NOT used AND expires_at > now() ORDER BY id DESC LIMIT 1`, [phone])
  if (!row) throw new DomainError('That code has expired. Ask for a new one.')
  if (row.attempts >= 5) throw new DomainError('Too many wrong tries. Ask for a new code.')
  if (row.code_hash !== hash(phone, code.trim())) {
    await q('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [row.id])
    return false
  }
  await q('UPDATE otp_codes SET used = true WHERE id = $1', [row.id])
  return true
}
