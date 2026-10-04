'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api, ErrorNote, rupees, Spinner, useT } from '@/lib/client/ui.tsx'
import BasicsForm, { type Basics } from '@/components/BasicsForm.tsx'
import PhotoManager from '@/components/PhotoManager.tsx'
import SelfieCheck from '@/components/SelfieCheck.tsx'

type U = Basics & {
  id: number; phone: string; created_by: string; track: string | null; dating_purpose: string | null; pool: string | null; lang: 'en' | 'ml'
  about: string | null; credit_paise: number; selfie_status: string; strikes: number
}
type Ledger = { delta_paise: number; reason: string; note: string | null; created_at: string }

function b64ToUint8(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export default function Me({ user, ledger, vapid }: { user: U; ledger: Ledger[]; vapid: string | null }) {
  const t = useT()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [about, setAbout] = useState(user.about ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [push, setPush] = useState<'unknown' | 'on' | 'off' | 'unsupported'>('unknown')

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !vapid) { setPush('unsupported'); return }
    navigator.serviceWorker.getRegistration('/sw.js').then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription()
      setPush(sub ? 'on' : 'off')
    }).catch(() => setPush('off'))
  }, [vapid])

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key); setErr(null); setMsg(null)
    try { await fn(); if (ok) setMsg(ok); router.refresh() } catch (e) { setErr((e as Error).message) } finally { setBusy(null) }
  }

  async function enablePush() {
    await run('push', async () => {
      const reg = await navigator.serviceWorker.register('/sw.js')
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') throw new Error('Notifications are blocked in your browser settings.')
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(vapid!) })
      await api('/api/push', { body: sub.toJSON() })
      setPush('on')
    })
  }

  const purposeKey = user.track === 'MATRIMONY' ? 'ob.track.MATRIMONY' : `ob.purpose.${user.dating_purpose}`

  return (
    <main className="max-w-lg mx-auto px-4 pt-5 space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('me.title')}</h1>
        <Link href={`/u/${user.id}`} className="text-sm text-maroon font-semibold">{t('me.preview')} →</Link>
      </header>
      {msg && <p className="text-sm bg-green-50 text-green-800 rounded-xl px-3 py-2">{msg}</p>}
      <ErrorNote text={err} />

      <section className="grid grid-cols-3 gap-2 text-center">
        <div className="card p-3"><div className="text-xs text-muted">{t('me.credit')}</div><div className="font-semibold text-maroon">{rupees(user.credit_paise)}</div></div>
        <div className="card p-3"><div className="text-xs text-muted">{t('me.selfie')}</div><div className="font-semibold text-sm">{user.selfie_status === 'VERIFIED' ? `✓ ${t('common.verified')}` : user.selfie_status}</div></div>
        <div className="card p-3"><div className="text-xs text-muted">{t('me.strikes')}</div><div className={`font-semibold ${user.strikes ? 'text-red-700' : ''}`}>{user.strikes}</div></div>
      </section>
      {user.credit_paise > 0 && <p className="text-xs text-muted -mt-3">{t('me.creditNote')}</p>}

      {(user.selfie_status === 'REJECTED' || user.selfie_status === 'NONE') && (
        <section className="card p-4 space-y-3">
          <h2 className="font-semibold">{t('ob.selfie.title')}</h2>
          <p className="text-sm text-muted">{t('ob.selfie.intro')}</p>
          <SelfieCheck onVerified={() => router.refresh()} />
        </section>
      )}

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">{t('me.photos')}</h2>
        <PhotoManager />
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">{t('me.about')}</h2>
        <textarea className="input min-h-40 leading-relaxed" value={about} onChange={(e) => setAbout(e.target.value)} maxLength={2000} />
        <button className="btn btn-ghost w-full" disabled={busy === 'about' || about === user.about}
          onClick={() => run('about', () => api('/api/me', { method: 'PATCH', body: { about } }), '✓')}>{busy === 'about' && <Spinner />} {t('common.save')}</button>
      </section>

      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{t('me.edit')}</h2>
          <button className="text-sm text-maroon font-semibold" onClick={() => setEditing((e) => !e)}>{editing ? t('common.close') : t('me.edit')}</button>
        </div>
        {editing && <BasicsForm initial={user} pool={user.pool} bySelf={user.created_by === 'SELF'} submitLabel={t('common.save')} endpoint="me"
          onDone={() => { setEditing(false); setMsg('✓'); router.refresh() }} />}
      </section>

      <section className="card p-4 space-y-4">
        <h2 className="font-semibold">{t('me.settings')}</h2>
        <div>
          <div className="text-xs font-semibold text-muted mb-2">{t('me.language')}</div>
          <div className="flex gap-2">
            {(['en', 'ml'] as const).map((l) => (
              <button key={l} className="choice !py-2 !w-auto px-4" aria-pressed={user.lang === l}
                onClick={() => run('lang', () => api('/api/me', { method: 'PATCH', body: { lang: l } }))}>{l === 'en' ? 'English' : 'മലയാളം'}</button>
            ))}
          </div>
        </div>
        {user.created_by === 'SELF' && <Purpose current={user} onSaved={() => { setMsg('✓'); router.refresh() }} label={t('me.purpose')} currentLabel={t(purposeKey as 'ob.track.MATRIMONY')} />}
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm">{t('me.notify')}</div>
          {push === 'on' ? <span className="text-sm text-green-700">✓ {t('me.notifyDone')}</span>
            : push === 'unsupported' ? <span className="text-xs text-muted">—</span>
            : <button className="btn btn-ghost !py-1.5 text-sm" disabled={busy === 'push'} onClick={enablePush}>{t('me.notifyOn')}</button>}
        </div>
        <div className="text-xs text-muted">{user.phone}</div>
      </section>

      {ledger.length > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold mb-2">{t('me.credit')}</h2>
          <ul className="text-sm divide-y divide-line">
            {ledger.map((l, i) => (
              <li key={i} className="py-2 flex justify-between gap-3">
                <span className="text-muted">{l.note ?? l.reason.replace(/_/g, ' ').toLowerCase()}</span>
                <span className={l.delta_paise > 0 ? 'text-green-700 font-semibold' : ''}>{l.delta_paise > 0 ? '+' : ''}{rupees(l.delta_paise)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2 pb-4">
        <button className="btn btn-ghost w-full" onClick={() => run('logout', async () => { await api('/api/auth/logout', { body: {} }); window.location.href = '/' })}>{t('me.logout')}</button>
        <button className="btn btn-danger w-full" onClick={() => {
          if (window.confirm(t('me.deleteConfirm'))) run('delete', async () => { await api('/api/me', { method: 'DELETE' }); window.location.href = '/' })
        }}>{t('me.delete')}</button>
        <p className="text-center text-xs text-muted pt-4">{t('footer.credit')}</p>
      </section>
    </main>
  )
}

function Purpose({ current, onSaved, label, currentLabel }: { current: U; onSaved: () => void; label: string; currentLabel: string }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [track, setTrack] = useState(current.track ?? 'MATRIMONY')
  const [purpose, setPurpose] = useState(current.dating_purpose ?? '')
  const [err, setErr] = useState<string | null>(null)
  async function save() {
    setErr(null)
    try {
      await api('/api/me', { method: 'PATCH', body: { purpose: { track, purpose: track === 'DATING' ? purpose : undefined } } })
      setOpen(false); onSaved()
    } catch (e) { setErr((e as Error).message) }
  }
  return (
    <div>
      <div className="flex items-center justify-between">
        <div><div className="text-xs font-semibold text-muted">{label}</div><div className="text-sm">{currentLabel}</div></div>
        <button className="text-sm text-maroon font-semibold" onClick={() => setOpen((o) => !o)}>{open ? t('common.close') : t('me.edit')}</button>
      </div>
      {open && (
        <div className="space-y-2 mt-3">
          <button className="choice" aria-pressed={track === 'MATRIMONY'} onClick={() => setTrack('MATRIMONY')}>{t('ob.track.MATRIMONY')}</button>
          {(['MARRIAGE', 'LONG_TERM', 'CASUAL'] as const).map((p) => (
            <button key={p} className="choice" aria-pressed={track === 'DATING' && purpose === p} onClick={() => { setTrack('DATING'); setPurpose(p) }}>
              <div className="font-semibold">{t(`ob.purpose.${p}`)}</div><div className="text-sm text-muted">{t(`ob.purpose.${p}.d`)}</div>
            </button>
          ))}
          <p className="text-xs text-muted">{t('ob.purpose.note')}</p>
          <ErrorNote text={err} />
          <button className="btn btn-primary w-full" onClick={save}>{t('common.save')}</button>
        </div>
      )}
    </div>
  )
}
