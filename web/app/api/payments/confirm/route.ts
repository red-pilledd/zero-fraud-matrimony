import { z } from 'zod'
import { handle, ok } from '@/lib/server/http.ts'
import { apiUser } from '@/lib/server/auth.ts'
import { confirmFromCheckout } from '@/lib/domain/payments.ts'

export const POST = handle(async (req: Request) => {
  const u = await apiUser({ onboarded: true })
  const b = z.object({ orderId: z.string(), paymentId: z.string(), signature: z.string() }).parse(await req.json())
  const conversationId = await confirmFromCheckout(u, b.orderId, b.paymentId, b.signature)
  return ok({ conversationId })
})
