import { z } from 'zod'
import { handle, ok } from '@/lib/server/http.ts'
import { apiUser } from '@/lib/server/auth.ts'
import { finishInterview } from '@/lib/domain/onboarding.ts'
import { screenRules } from '@/lib/moderation/rules.ts'
import { DomainError } from '@/lib/pg.ts'

export const POST = handle(async (req: Request) => {
  const u = await apiUser()
  const { about } = z.object({ about: z.string() }).parse(await req.json())
  if (screenRules(about, { senderRecent: [], contactApproved: false }).block) {
    throw new DomainError("The About section can't contain phone numbers, links or social media IDs.")
  }
  await finishInterview(u, about)
  return ok()
})
