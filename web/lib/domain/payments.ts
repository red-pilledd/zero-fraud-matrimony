import 'server-only'
import { q, q0, tx } from '../server/db.ts'
import { getSettings } from '../server/settings.ts'
import { DomainError } from '../pg.ts'
import { createOrder, gatewayMode, verifyCheckoutSignature } from '../payments/gateway.ts'
import { afterRequest, checkCanRequest, createConversation, screenIntro, startWithCredit } from './conversations.ts'
import type { User } from '../types.ts'

export type StartResult =
  | { kind: 'started'; conversationId: number }
  | { kind: 'pay'; mode: 'RAZORPAY' | 'TEST'; orderId: string; keyId?: string; amount: number; brand: string; prefill: { contact: string } }

/** Step 1 of starting a conversation: screen the note, then either spend credit or open a payment order. */
export async function beginConversation(user: User, recipientId: number, introRaw: string): Promise<StartResult> {
  await checkCanRequest(user, recipientId)
  const intro = await screenIntro(user, introRaw)
  const s = await getSettings()
  const price = s.price_paise[user.pool!]
  if (user.credit_paise >= price) {
    return { kind: 'started', conversationId: await startWithCredit(user, recipientId, intro) }
  }
  const mode = gatewayMode()
  if (mode === 'NONE') throw new DomainError('Payments are not available right now.')
  const { orderId, keyId } = await createOrder(price, `u${user.id}-r${recipientId}-${Date.now()}`)
  await q(
    `INSERT INTO payments (user_id, recipient_id, intro, amount_paise, provider, order_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [user.id, recipientId, intro, price, mode, orderId])
  return { kind: 'pay', mode, orderId, keyId, amount: price, brand: s.brand_name, prefill: { contact: user.phone } }
}

/**
 * Step 2: a payment came back (from Checkout in the browser, or the webhook). Idempotent — whichever
 * arrives first creates the conversation; the other finds it already done. If the pair got a conversation
 * some other way in between, the money becomes credit rather than vanishing.
 */
export async function completePayment(orderId: string, paymentId: string, opts: { userId?: number }): Promise<number | null> {
  const result = await tx(async (db) => {
    const { rows } = await db.query<{ id: number; user_id: number; recipient_id: number; intro: string; amount_paise: number; status: string; conversation_id: number | null }>(
      'SELECT * FROM payments WHERE order_id = $1 FOR UPDATE', [orderId])
    const p = rows[0]
    if (!p) throw new DomainError('Payment not found')
    if (opts.userId && p.user_id !== opts.userId) throw new DomainError('Payment not found')
    if (p.status === 'PAID') return { conversationId: p.conversation_id, recipientId: p.recipient_id, fresh: false }
    await db.query(`UPDATE payments SET status = 'PAID', payment_id = $2, paid_at = now() WHERE id = $1`, [p.id, paymentId])
    const { rows: ur } = await db.query<User>('SELECT * FROM users WHERE id = $1', [p.user_id])
    try {
      const cid = await createConversation(db, { initiator: ur[0], recipientId: p.recipient_id, intro: p.intro, price: p.amount_paise, paidVia: 'GATEWAY', paymentId: p.id })
      await db.query('UPDATE payments SET conversation_id = $2 WHERE id = $1', [p.id, cid])
      return { conversationId: cid, recipientId: p.recipient_id, fresh: true }
    } catch (err) {
      if (!(err instanceof DomainError)) throw err
      await db.query('UPDATE users SET credit_paise = credit_paise + $2 WHERE id = $1', [p.user_id, p.amount_paise])
      await db.query(`INSERT INTO credit_ledger (user_id, delta_paise, reason, note) VALUES ($1,$2,'ADMIN',$3)`,
        [p.user_id, p.amount_paise, `Payment ${paymentId} kept as credit: ${err.message}`])
      return { conversationId: null, recipientId: p.recipient_id, fresh: false }
    }
  })
  if (result.fresh && result.conversationId) afterRequest(result.recipientId, result.conversationId)
  return result.conversationId
}

export async function confirmFromCheckout(user: User, orderId: string, paymentId: string, signature: string): Promise<number | null> {
  if (!verifyCheckoutSignature(orderId, paymentId, signature)) throw new DomainError('Payment could not be verified')
  const p = await q0('SELECT 1 FROM payments WHERE order_id = $1 AND user_id = $2', [orderId, user.id])
  if (!p) throw new DomainError('Payment not found')
  return completePayment(orderId, paymentId, { userId: user.id })
}
