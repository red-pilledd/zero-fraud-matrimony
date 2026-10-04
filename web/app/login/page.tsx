'use client'
import { useState } from 'react'
import Link from 'next/link'
import { api, ErrorNote, Spinner } from '@/lib/client/ui.tsx'

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Thuna'

export default function Login() {
  const [phone, setPhone] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const r = await api<{ phone: string; devCode?: string }>('/api/auth/otp', { body: { phone } })
      setSentTo(r.phone); setDevCode(r.devCode ?? null)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const r = await api<{ next: string }>('/api/auth/verify', { body: { phone: sentTo, code } })
      window.location.href = r.next
    } catch (e) { setErr((e as Error).message); setBusy(false) }
  }

  return (
    <main className="min-h-dvh grid place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-center font-serif text-3xl font-bold text-maroon mb-8">{BRAND}</Link>
        <div className="card p-6">
          <h1 className="text-lg font-semibold mb-1">Sign in with your mobile number</h1>
          <p className="text-sm text-muted mb-5">മൊബൈൽ നമ്പർ ഉപയോഗിച്ച് പ്രവേശിക്കുക</p>
          {!sentTo ? (
            <form onSubmit={send} className="space-y-4">
              <label className="field">
                <span>Mobile number</span>
                <div className="flex gap-2">
                  <div className="input !w-16 text-center text-muted">+91</div>
                  <input className="input" inputMode="numeric" autoComplete="tel-national" placeholder="98470 12345"
                    value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus required />
                </div>
              </label>
              <ErrorNote text={err} />
              <button className="btn btn-primary w-full" disabled={busy}>{busy && <Spinner />} Send code</button>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-4">
              <p className="text-sm">Code sent to <b>{sentTo}</b></p>
              {devCode && (
                <p className="text-sm bg-gold-light rounded-xl px-3 py-2">Test mode — your code is <b className="tracking-widest">{devCode}</b></p>
              )}
              <label className="field">
                <span>6-digit code</span>
                <input className="input tracking-[0.4em] text-center text-xl" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus required />
              </label>
              <ErrorNote text={err} />
              <button className="btn btn-primary w-full" disabled={busy || code.length !== 6}>{busy && <Spinner />} Verify & continue</button>
              <button type="button" className="text-sm text-maroon w-full" onClick={() => { setSentTo(null); setCode(''); setErr(null) }}>Change number</button>
            </form>
          )}
        </div>
        <p className="text-xs text-muted mt-5 leading-relaxed">
          By continuing you agree that our AI reads messages for safety before they are delivered, builds a private understanding of
          members to keep everyone safe and suggest better matches, and that contact details can only be shared after both members agree.
          You must be 18 or older.
        </p>
      </div>
    </main>
  )
}
