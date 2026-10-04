import { z } from 'zod'
import { handle, ok } from '@/lib/server/http.ts'
import { apiUser } from '@/lib/server/auth.ts'
import { q } from '@/lib/server/db.ts'

export const GET = handle(async () => ok({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null }))

export const POST = handle(async (req: Request) => {
  const u = await apiUser()
  const s = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }).parse(await req.json())
  await q(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4)
           ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [u.id, s.endpoint, s.keys.p256dh, s.keys.auth])
  return ok()
})
