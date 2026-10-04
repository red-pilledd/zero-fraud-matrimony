import { z } from 'zod'
import { handle, ok } from '@/lib/server/http.ts'
import { apiUser } from '@/lib/server/auth.ts'
import { listInbox } from '@/lib/domain/inbox.ts'
import { beginConversation } from '@/lib/domain/payments.ts'

export const GET = handle(async () => {
  const u = await apiUser({ onboarded: true })
  return ok({ items: await listInbox(u), credit: u.credit_paise })
})

export const POST = handle(async (req: Request) => {
  const u = await apiUser({ onboarded: true, canAct: true })
  const b = z.object({ recipientId: z.number().int(), intro: z.string() }).parse(await req.json())
  return ok(await beginConversation(u, b.recipientId, b.intro))
})
