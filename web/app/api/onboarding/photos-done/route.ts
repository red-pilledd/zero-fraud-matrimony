import { handle, ok } from '@/lib/server/http.ts'
import { apiUser } from '@/lib/server/auth.ts'
import { finishPhotos } from '@/lib/domain/onboarding.ts'

export const POST = handle(async () => {
  const u = await apiUser()
  await finishPhotos(u)
  return ok()
})
