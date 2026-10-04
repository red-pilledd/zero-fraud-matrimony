import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// Razorpay (UPI / cards / netbanking) when keys are configured.
// Without keys, and only outside production, a TEST gateway lets the full flow be exercised locally.

export type GatewayMode = 'RAZORPAY' | 'TEST' | 'NONE'

export function gatewayMode(): GatewayMode {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) return 'RAZORPAY'
  if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_TEST_PAYMENTS === '1') return 'TEST'
  return 'NONE'
}

export async function createOrder(amountPaise: number, receipt: string): Promise<{ orderId: string; keyId?: string }> {
  const mode = gatewayMode()
  if (mode === 'TEST') return { orderId: `test_order_${randomBytes(8).toString('hex')}` }
  if (mode === 'NONE') throw new Error('Payments are not configured')
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, payment_capture: 1 }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`Razorpay order failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  const j = (await res.json()) as { id: string }
  return { orderId: j.id, keyId: process.env.RAZORPAY_KEY_ID }
}

/** Razorpay Checkout returns order_id|payment_id signed with the key secret. */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const mode = gatewayMode()
  if (mode === 'TEST') return orderId.startsWith('test_order_') && paymentId.startsWith('test_pay_') && signature === 'test'
  if (mode === 'NONE') return false
  const expected = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!).update(`${orderId}|${paymentId}`).digest('hex')
  const a = Buffer.from(expected), b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Webhook body signed with the webhook secret (set in the Razorpay dashboard). */
export function verifyWebhook(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(expected), b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}
