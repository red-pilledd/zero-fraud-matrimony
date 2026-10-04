import { z } from 'zod'
import { handle, ok } from '@/lib/server/http.ts'
import { apiUser } from '@/lib/server/auth.ts'
import { issueChallenge, submitSelfie } from '@/lib/domain/onboarding.ts'
import { CHALLENGES_ML } from '@/lib/ai/vision.ts'

export const GET = handle(async () => {
  const u = await apiUser()
  const c = await issueChallenge(u)
  return ok({ ...c, challenge_ml: CHALLENGES_ML[c.challenge] ?? c.challenge })
})

export const POST = handle(async (req: Request) => {
  const u = await apiUser()
  const b = z.object({ checkId: z.number().int(), image: z.string().max(8_000_000) }).parse(await req.json())
  return ok(await submitSelfie(u, b.checkId, b.image))
})
