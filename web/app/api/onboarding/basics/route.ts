import { handle, ok } from '@/lib/server/http.ts'
import { apiUser } from '@/lib/server/auth.ts'
import { saveBasics } from '@/lib/domain/onboarding.ts'

export const POST = handle(async (req: Request) => {
  const u = await apiUser()
  await saveBasics(u, await req.json())
  return ok()
})
