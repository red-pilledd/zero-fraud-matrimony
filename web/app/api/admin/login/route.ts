import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { handle, ok, fail, clientIp } from '@/lib/server/http.ts'
import { startAdmin, endAdmin } from '@/lib/server/auth.ts'
import { q, q0 } from '@/lib/server/db.ts'

export const POST = handle(async (req: Request) => {
  const { password } = z.object({ password: z.string().max(200) }).parse(await req.json())
  const ip = clientIp(req)
  const fails = await q0<{ n: string }>(
    `SELECT COUNT(*) AS n FROM login_attempts WHERE key = 'admin' AND NOT success AND at > now() - interval '15 minutes'`)
  if (Number(fails?.n) >= 8) return fail('Too many attempts — wait 15 minutes.', 429)
  // stored base64-encoded: a raw bcrypt hash contains $ signs that .env expansion would mangle
  const hash = process.env.ADMIN_PASSWORD_HASH_B64 && Buffer.from(process.env.ADMIN_PASSWORD_HASH_B64, 'base64').toString('utf8')
  const good = !!hash && (await bcrypt.compare(password, hash))
  await q(`INSERT INTO login_attempts (key, ip, success) VALUES ('admin',$1,$2)`, [ip, good])
  if (!good) return fail('Wrong password', 401)
  await startAdmin()
  return ok()
})

export const DELETE = handle(async () => {
  await endAdmin()
  return ok()
})
