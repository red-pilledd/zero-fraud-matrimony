import { handle, ok } from '@/lib/server/http.ts'
import { apiUser } from '@/lib/server/auth.ts'
import { setIntent } from '@/lib/domain/onboarding.ts'

export const POST = handle(async (req: Request) => {
  const u = await apiUser()
  await setIntent(u, await req.json())
  return ok()
})
