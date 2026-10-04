import { handle, ok } from '@/lib/server/http.ts'
import { endSession } from '@/lib/server/auth.ts'

export const POST = handle(async () => {
  await endSession()
  return ok()
})
