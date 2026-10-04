'use client'
import { useState } from 'react'
import { api, ErrorNote, rupees, Spinner, useT } from '@/lib/client/ui.tsx'

type Pay = { kind: 'pay'; mode: 'RAZORPAY' | 'TEST'; orderId: string; keyId?: string; amount: number; brand: string; prefill: { contact: string } }
type Start = { kind: 'started'; conversationId: number } | Pay

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, fn: (r: unknown) => void) => void }
  }
}

function loadCheckout(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve()
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load the payment page. Check your internet and try again.'))
    document.body.appendChild(s)
  })
}

export default function StartConversation({ recipientId, name, price, credit, mode, canStart }: {
  recipientId: number; name: string; price: number; credit: number; mode: string; canStart: boolean
}) {
  const t = useT()
  const [intro, setIntro] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [testPay, setTestPay] = useState<Pay | null>(null)
  const useCredit = credit >= price

  const go = (id: number | null) => { window.location.href = id ? `/chat/${id}` : '/inbox' }

  async function confirm(orderId: string, paymentId: string, signature: string) {
    const r = await api<{ conversationId: number | null }>('/api/payments/confirm', { body: { orderId, paymentId, signature } })
    go(r.conversationId)
  }

  async function start() {
    setBusy(true); setErr(null)
    try {
      const r = await api<Start>('/api/conversations', { body: { recipientId, intro } })
      if (r.kind === 'started') return go(r.conversationId)
      if (r.mode === 'TEST') { setTestPay(r); setBusy(false); return }
      await loadCheckout()
      const rzp = new window.Razorpay!({
        key: r.keyId, order_id: r.orderId, amount: r.amount, currency: 'INR', name: r.brand,
        description: `Conversation with ${name}`, prefill: r.prefill, theme: { color: '#7b1e3a' },
        handler: (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          confirm(resp.razorpay_order_id, resp.razorpay_payment_id, resp.razorpay_signature).catch((e) => { setErr((e as Error).message); setBusy(false) })
        },
        modal: { ondismiss: () => setBusy(false) },
      })
      rzp.on('payment.failed', () => { setErr('Payment failed. No money was taken — try again.'); setBusy(false) })
      rzp.open()
    } catch (e) { setErr((e as Error).message); setBusy(false) }
  }

  if (!canStart) return <div className="card p-5 text-sm text-muted">{t('disc.pendingSelfie')}</div>

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">{t('prof.start')}</h2>
        <div className="text-sm"><span className="text-muted">{t('prof.price')}</span> <b className="text-maroon">{rupees(price)}</b></div>
      </div>
      <label className="field">
        <span>{t('prof.introLabel')}</span>
        <textarea className="input min-h-24" maxLength={500} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder={t('prof.introHint')} />
      </label>
      <p className="text-xs text-muted">{t('prof.refund')}</p>
      {credit > 0 && <p className="text-xs">{t('prof.credit')}: <b>{rupees(credit)}</b></p>}
      <ErrorNote text={err} />
      {testPay ? (
        <div className="rounded-xl border-2 border-dashed border-gold p-3 space-y-2">
          <p className="text-sm">{t('prof.testPay')} — {rupees(testPay.amount)}</p>
          <button className="btn btn-gold w-full" disabled={busy} onClick={async () => {
            setBusy(true)
            try { await confirm(testPay.orderId, `test_pay_${Date.now()}`, 'test') } catch (e) { setErr((e as Error).message); setBusy(false) }
          }}>{busy && <Spinner />} {t('prof.pay')} {rupees(testPay.amount)}</button>
        </div>
      ) : (
        <button className="btn btn-primary w-full" disabled={busy || intro.trim().length < 10 || mode === 'NONE'} onClick={start}>
          {busy && <Spinner />} {useCredit ? `${t('prof.useCredit')} (${rupees(price)})` : `${t('prof.pay')} ${rupees(price)}`}
        </button>
      )}
    </div>
  )
}
