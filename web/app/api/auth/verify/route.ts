import { z } from 'zod'
import { handle, ok, fail, clientIp } from '@/lib/server/http.ts'
import { normalisePhone, checkOtp } from '@/lib/server/otp.ts'
import { startSession } from '@/lib/server/auth.ts'
import { q, q0 } from '@/lib/server/db.ts'

type Row = { id: number; session_version: number; status: string; onboarding_step: string }

export const POST = handle(async (req: Request) => {
  const b = z.object({ phone: z.string(), code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') }).parse(await req.json())
  const phone = normalisePhone(b.phone)
  const good = await checkOtp(phone, b.code)
  await q('INSERT INTO login_attempts (key, ip, success) VALUES ($1,$2,$3)', [phone, clientIp(req), good])
  if (!good) return fail('Wrong code. Check the SMS and try again.')
  let u = await q0<Row>('SELECT id, session_version, status, onboarding_step FROM users WHERE phone = $1', [phone])
  if (u?.status === 'BANNED') return fail('This number is not allowed on the platform.', 403)
  if (u?.status === 'DELETED') {
    u = await q0<Row>(
      `UPDATE users SET status = 'ACTIVE', onboarding_step = 'INTENT', session_version = session_version + 1 WHERE id = $1
       RETURNING id, session_version, status, onboarding_step`, [u.id])
  }
  if (!u) u = (await q<Row>('INSERT INTO users (phone) VALUES ($1) RETURNING id, session_version, status, onboarding_step', [phone]))[0]
  await startSession(u!)
  return ok({ next: u!.onboarding_step === 'DONE' ? '/discover' : '/onboarding' })
})
