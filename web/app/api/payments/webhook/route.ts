import { verifyWebhook } from '@/lib/payments/gateway.ts'
import { completePayment } from '@/lib/domain/payments.ts'

// Razorpay → us. Catches payments where the member closed the app before Checkout returned.
// Configure in the Razorpay dashboard: URL /api/payments/webhook, event payment.captured, secret = RAZORPAY_WEBHOOK_SECRET.
export async function POST(req: Request) {
  const raw = await req.text()
  if (!verifyWebhook(raw, req.headers.get('x-razorpay-signature') ?? '')) return new Response('bad signature', { status: 401 })
  try {
    const e = JSON.parse(raw) as { event: string; payload?: { payment?: { entity?: { id: string; order_id: string } } } }
    const p = e.payload?.payment?.entity
    if (e.event === 'payment.captured' && p?.order_id) await completePayment(p.order_id, p.id, {})
  } catch (err) {
    console.error('[webhook]', err)
    return new Response('error', { status: 500 }) // Razorpay retries
  }
  return new Response('ok')
}
