import { z } from 'zod'
import { handle, ok, clientIp } from '@/lib/server/http.ts'
import { normalisePhone, sendOtp } from '@/lib/server/otp.ts'

export const POST = handle(async (req: Request) => {
  const { phone } = z.object({ phone: z.string() }).parse(await req.json())
  const p = normalisePhone(phone)
  const r = await sendOtp(p, clientIp(req))
  return ok({ phone: p, ...r })
})
