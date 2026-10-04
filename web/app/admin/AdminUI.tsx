'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, Spinner } from '@/lib/client/ui.tsx'

/** One button = one admin action. Optional prompt for a reason/amount. */
export function ActionButton({ label, body, confirm, prompt, promptKey, tone = 'ghost', numeric }: {
  label: string; body: Record<string, unknown>; confirm?: string; prompt?: string; promptKey?: string
  tone?: 'ghost' | 'primary' | 'danger'; numeric?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  async function run() {
    if (confirm && !window.confirm(confirm)) return
    let payload = body
    if (prompt && promptKey) {
      const v = window.prompt(prompt)
      if (v === null || !v.trim()) return
      payload = { ...body, [promptKey]: numeric ? Number(v) : v.trim() }
    }
    setBusy(true); setMsg(null)
    try {
      const r = await api<{ message: string }>('/api/admin', { body: payload })
      setMsg(r.message)
      router.refresh()
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button className={`btn btn-${tone} !py-1.5 !px-3 text-xs`} disabled={busy} onClick={run}>{busy && <Spinner />}{label}</button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  )
}

export function AdminLogin() {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <form className="card p-6 w-full max-w-sm space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setErr(null)
      try { await api('/api/admin/login', { body: { password: pw } }); window.location.href = '/admin' } catch (e) { setErr((e as Error).message) }
    }}>
      <h1 className="font-semibold">Admin sign-in</h1>
      <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus placeholder="Password" />
      {err && <p className="text-sm text-red-700">{err}</p>}
      <button className="btn btn-primary w-full">Sign in</button>
    </form>
  )
}

export function AdminLogout() {
  return <button className="text-sm text-white/80 hover:text-white" onClick={async () => { await api('/api/admin/login', { method: 'DELETE' }); window.location.href = '/admin/login' }}>Sign out</button>
}

type S = {
  price_paise: Record<'MARRIAGE' | 'LONG_TERM' | 'CASUAL', number>; reply_window_hours: number; contact_min_messages: number; contact_min_each: number
  contact_min_hours: number; contact_retry_hours: number; character_every_msgs: number; strike_freeze_at: number; strike_ban_at: number; freeze_days: number
  ai: Record<'screen' | 'deep' | 'vision', { provider: 'anthropic' | 'gemini'; model: string }>; usd_inr: number
}

export function SettingsForm({ initial, models }: { initial: S; models: string[] }) {
  const router = useRouter()
  const [s, setS] = useState<S>(initial)
  const [msg, setMsg] = useState<string | null>(null)
  const num = (v: string) => (v === '' ? 0 : Number(v))
  const field = (label: string, value: number, on: (n: number) => void, hint?: string) => (
    <label className="field"><span>{label}</span>
      <input className="input" type="number" value={value} onChange={(e) => on(num(e.target.value))} />
      {hint && <small className="text-xs text-muted">{hint}</small>}
    </label>
  )
  return (
    <form className="space-y-6" onSubmit={async (e) => {
      e.preventDefault(); setMsg(null)
      try { const r = await api<{ message: string }>('/api/admin', { body: { action: 'settings', settings: s } }); setMsg(r.message); router.refresh() }
      catch (e) { setMsg((e as Error).message) }
    }}>
      <section className="card p-5 grid sm:grid-cols-3 gap-4">
        <h2 className="sm:col-span-3 font-semibold">Price to start a conversation (₹)</h2>
        {(['MARRIAGE', 'LONG_TERM', 'CASUAL'] as const).map((p) =>
          field(p === 'MARRIAGE' ? 'Marriage section' : p === 'LONG_TERM' ? 'Long-term section' : 'Casual section', s.price_paise[p] / 100,
            (n) => setS({ ...s, price_paise: { ...s.price_paise, [p]: Math.round(n * 100) } })))}
        {field('Reply window (hours)', s.reply_window_hours, (n) => setS({ ...s, reply_window_hours: n }), 'No reply in this time → automatic refund as credit')}
      </section>
      <section className="card p-5 grid sm:grid-cols-3 gap-4">
        <h2 className="sm:col-span-3 font-semibold">Contact exchange — minimums before the AI is even asked</h2>
        {field('Total messages', s.contact_min_messages, (n) => setS({ ...s, contact_min_messages: n }))}
        {field('Messages from each person', s.contact_min_each, (n) => setS({ ...s, contact_min_each: n }))}
        {field('Hours since chat opened', s.contact_min_hours, (n) => setS({ ...s, contact_min_hours: n }))}
        {field('Wait before asking again (hours)', s.contact_retry_hours, (n) => setS({ ...s, contact_retry_hours: n }))}
      </section>
      <section className="card p-5 grid sm:grid-cols-3 gap-4">
        <h2 className="sm:col-span-3 font-semibold">Rules & character</h2>
        {field('Warnings before a pause', s.strike_freeze_at, (n) => setS({ ...s, strike_freeze_at: n }))}
        {field('Warnings before a ban', s.strike_ban_at, (n) => setS({ ...s, strike_ban_at: n }))}
        {field('Pause length (days)', s.freeze_days, (n) => setS({ ...s, freeze_days: n }))}
        {field('Rebuild character every N messages', s.character_every_msgs, (n) => setS({ ...s, character_every_msgs: n }))}
        {field('USD → INR (cost meter)', s.usd_inr, (n) => setS({ ...s, usd_inr: n }))}
      </section>
      <section className="card p-5 grid sm:grid-cols-3 gap-4">
        <h2 className="sm:col-span-3 font-semibold">AI models</h2>
        {(['screen', 'deep', 'vision'] as const).map((k) => (
          <label key={k} className="field"><span>{k === 'screen' ? 'Message screening (every message)' : k === 'deep' ? 'Interview, character, contact review' : 'Photo & selfie checks'}</span>
            <select className="input" value={`${s.ai[k].provider}:${s.ai[k].model}`} onChange={(e) => {
              const [provider, model] = e.target.value.split(':') as ['anthropic' | 'gemini', string]
              setS({ ...s, ai: { ...s.ai, [k]: { provider, model } } })
            }}>
              {models.map((m) => <option key={m} value={`${m.startsWith('gemini') ? 'gemini' : 'anthropic'}:${m}`}>{m}</option>)}
            </select>
          </label>
        ))}
        <p className="sm:col-span-3 text-xs text-muted">Gemini needs GEMINI_API_KEY set on the server. Every switch shows up in the cost meter on the dashboard.</p>
      </section>
      <div className="flex items-center gap-3"><button className="btn btn-primary">Save settings</button>{msg && <span className="text-sm text-muted">{msg}</span>}</div>
    </form>
  )
}
