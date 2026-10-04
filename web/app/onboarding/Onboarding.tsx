'use client'
import { useEffect, useRef, useState } from 'react'
import { api, ErrorNote, LangProvider, Spinner, useT } from '@/lib/client/ui.tsx'
import type { Lang } from '@/lib/i18n.ts'
import BasicsForm, { type Basics } from '@/components/BasicsForm.tsx'
import PhotoManager from '@/components/PhotoManager.tsx'
import SelfieCheck from '@/components/SelfieCheck.tsx'

type Step = 'INTENT' | 'BASICS' | 'INTERVIEW' | 'PHOTOS' | 'SELFIE' | 'DONE'
type UserLite = Basics & { created_by: string; pool: string | null; lang: Lang; selfie_status: string }
const ORDER: Step[] = ['INTENT', 'BASICS', 'INTERVIEW', 'PHOTOS', 'SELFIE']
const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Thuna'

export default function Onboarding({ initialStep, user }: { initialStep: Step; user: UserLite }) {
  const [lang, setLang] = useState<Lang>(user.lang)
  return (
    <LangProvider lang={lang}>
      <Flow initialStep={initialStep} user={user} lang={lang} setLang={setLang} />
    </LangProvider>
  )
}

function Flow({ initialStep, user, lang, setLang }: { initialStep: Step; user: UserLite; lang: Lang; setLang: (l: Lang) => void }) {
  const t = useT()
  const [step, setStep] = useState<Step>(initialStep)
  const [pool, setPool] = useState(user.pool)
  const [bySelf, setBySelf] = useState(user.created_by === 'SELF')
  const idx = ORDER.indexOf(step)

  return (
    <main className="min-h-dvh max-w-lg mx-auto px-5 py-6">
      <header className="flex items-center justify-between mb-6">
        <div className="font-serif text-2xl font-bold text-maroon">{BRAND}</div>
        <div className="text-xs text-muted">{t('ob.step')} {idx + 1} {t('ob.of')} {ORDER.length}</div>
      </header>
      <div className="flex gap-1.5 mb-6">
        {ORDER.map((s, i) => <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= idx ? 'bg-maroon' : 'bg-line'}`} />)}
      </div>

      {step === 'INTENT' && (
        <Intent lang={lang} setLang={setLang} onDone={(p, self) => { setPool(p); setBySelf(self); setStep('BASICS') }} />
      )}
      {step === 'BASICS' && (
        <section>
          <h1 className="text-xl font-semibold mb-4">{bySelf ? t('ob.basics.self') : t('ob.basics.other')}</h1>
          <BasicsForm initial={user} pool={pool} bySelf={bySelf} submitLabel={t('common.next')} endpoint="onboarding" onDone={() => setStep('INTERVIEW')} />
        </section>
      )}
      {step === 'INTERVIEW' && <Interview onDone={() => setStep('PHOTOS')} />}
      {step === 'PHOTOS' && <Photos onDone={() => setStep('SELFIE')} />}
      {step === 'SELFIE' && (
        <section>
          <h1 className="text-xl font-semibold">{t('ob.selfie.title')}</h1>
          <p className="text-sm text-muted mt-1 mb-5">{t('ob.selfie.intro')}</p>
          <SelfieCheck onVerified={() => { window.location.href = '/discover' }} />
        </section>
      )}
      <p className="text-center text-xs text-muted mt-10">{t('footer.credit')}</p>
    </main>
  )
}

function Intent({ lang, setLang, onDone }: { lang: Lang; setLang: (l: Lang) => void; onDone: (pool: string, bySelf: boolean) => void }) {
  const t = useT()
  const [who, setWho] = useState<string | null>(null)
  const [track, setTrack] = useState<string | null>(null)
  const [purpose, setPurpose] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const self = who === 'SELF'
  const ready = who && (!self || track === 'MATRIMONY' || (track === 'DATING' && purpose))

  async function next() {
    setBusy(true); setErr(null)
    try {
      await api('/api/onboarding/intent', { body: { createdBy: who, track: self ? track : 'MATRIMONY', purpose: self && track === 'DATING' ? purpose : undefined, lang } })
      onDone(self && track === 'DATING' ? purpose! : 'MARRIAGE', self)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const Choice = ({ on, onClick, title, desc }: { on: boolean; onClick: () => void; title: string; desc?: string }) => (
    <button type="button" className="choice" aria-pressed={on} onClick={onClick}>
      <div className="font-semibold">{title}</div>
      {desc && <div className="text-sm text-muted mt-0.5">{desc}</div>}
    </button>
  )

  return (
    <section className="space-y-6">
      <div>
        <div className="text-xs font-semibold text-muted mb-2">{t('ob.lang')}</div>
        <div className="flex gap-2">
          {(['en', 'ml'] as const).map((l) => (
            <button key={l} type="button" className="choice !py-2 !w-auto px-4" aria-pressed={lang === l} onClick={() => setLang(l)}>
              {l === 'en' ? 'English' : 'മലയാളം'}
            </button>
          ))}
        </div>
      </div>
      <div>
        <h1 className="text-xl font-semibold mb-3">{t('ob.who.title')}</h1>
        <div className="grid grid-cols-2 gap-2">
          {(['SELF', 'PARENT', 'SIBLING', 'RELATIVE', 'FRIEND'] as const).map((w) => (
            <Choice key={w} on={who === w} onClick={() => { setWho(w); if (w !== 'SELF') { setTrack(null); setPurpose(null) } }} title={t(`ob.who.${w}`)} />
          ))}
        </div>
      </div>
      {self && (
        <div>
          <h2 className="text-lg font-semibold mb-3">{t('ob.track.title')}</h2>
          <div className="space-y-2">
            <Choice on={track === 'MATRIMONY'} onClick={() => { setTrack('MATRIMONY'); setPurpose(null) }} title={t('ob.track.MATRIMONY')} desc={t('ob.track.MATRIMONY.d')} />
            <Choice on={track === 'DATING'} onClick={() => setTrack('DATING')} title={t('ob.track.DATING')} desc={t('ob.track.DATING.d')} />
          </div>
        </div>
      )}
      {self && track === 'DATING' && (
        <div>
          <h2 className="text-lg font-semibold mb-1">{t('ob.purpose.title')}</h2>
          <p className="text-sm text-muted mb-3">{t('ob.purpose.note')}</p>
          <div className="space-y-2">
            {(['MARRIAGE', 'LONG_TERM', 'CASUAL'] as const).map((p) => (
              <Choice key={p} on={purpose === p} onClick={() => setPurpose(p)} title={t(`ob.purpose.${p}`)} desc={t(`ob.purpose.${p}.d`)} />
            ))}
          </div>
        </div>
      )}
      <ErrorNote text={err} />
      <button className="btn btn-primary w-full" disabled={!ready || busy} onClick={next}>{busy && <Spinner />} {t('common.next')}</button>
    </section>
  )
}

type IvState = { question: string | null; about: string | null; answered: number; max: number; turns: Array<{ role: 'ai' | 'user'; content: string }> }

function Interview({ onDone }: { onDone: () => void }) {
  const t = useT()
  const [s, setS] = useState<IvState | null>(null)
  const [text, setText] = useState('')
  const [about, setAbout] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)

  const load = async (p: Promise<IvState>) => {
    setBusy(true); setErr(null)
    try {
      const r = await p
      setS(r)
      if (r.about) setAbout(r.about)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  useEffect(() => { load(api<IvState>('/api/onboarding/interview')) }, [])
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [s, busy])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    const answer = text
    setText('')
    setS((prev) => prev && { ...prev, question: null, turns: [...prev.turns, { role: 'user', content: answer }] })
    setBusy(true); setErr(null)
    try {
      const r = await api<IvState>('/api/onboarding/interview', { body: { text: answer } })
      setS(r)
      if (r.about) setAbout(r.about)
    } catch (e) {
      setErr((e as Error).message)
      setText(answer)
      // show what the server actually has, not the optimistic bubble
      try { setS(await api<IvState>('/api/onboarding/interview')) } catch { /* keep the error shown */ }
    } finally { setBusy(false) }
  }

  async function saveAbout() {
    setBusy(true); setErr(null)
    try { await api('/api/onboarding/about', { body: { about } }); onDone() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  if (s && !s.question && s.about !== null) {
    return (
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">{t('ob.about.title')}</h1>
        <p className="text-sm text-muted">{t('ob.about.intro')}</p>
        <textarea className="input min-h-48 leading-relaxed" value={about} onChange={(e) => setAbout(e.target.value)} maxLength={2000} />
        <ErrorNote text={err} />
        <button className="btn btn-primary w-full" disabled={busy} onClick={saveAbout}>{busy && <Spinner />} {t('common.next')}</button>
      </section>
    )
  }

  return (
    <section>
      <h1 className="text-xl font-semibold">{t('ob.iv.title')}</h1>
      <p className="text-sm text-muted mt-1 mb-4">{t('ob.iv.intro')}</p>
      <div className="card p-4 space-y-3 min-h-64 max-h-[55dvh] overflow-y-auto">
        {s?.turns.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : ''}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug ${m.role === 'user' ? 'bg-maroon text-white rounded-br-md' : 'bg-maroon-50 rounded-bl-md'}`}>{m.content}</div>
          </div>
        ))}
        {busy && <div className="text-sm text-muted flex items-center gap-2"><Spinner /> {t('ob.iv.thinking')}</div>}
        <div ref={end} />
      </div>
      {s && <div className="text-xs text-muted mt-2">{Math.min(s.answered, s.max)} / {s.max}</div>}
      <ErrorNote text={err} />
      {err && !busy && <button className="btn btn-ghost w-full mt-2" onClick={() => load(api<IvState>('/api/onboarding/interview'))}>{t('common.retry')}</button>}
      <form onSubmit={send} className="flex gap-2 mt-3">
        <textarea className="input min-h-12 max-h-40" rows={2} placeholder={t('ob.iv.placeholder')} value={text}
          onChange={(e) => setText(e.target.value)} disabled={busy || !s?.question} />
        <button className="btn btn-primary self-end" disabled={busy || !text.trim()}>{t('common.send')}</button>
      </form>
    </section>
  )
}

function Photos({ onDone }: { onDone: () => void }) {
  const t = useT()
  const [approved, setApproved] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function next() {
    setBusy(true); setErr(null)
    try { await api('/api/onboarding/photos-done', { body: {} }); onDone() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">{t('ob.photos.title')}</h1>
      <p className="text-sm text-muted">{t('ob.photos.intro')}</p>
      <PhotoManager onChange={setApproved} />
      <ErrorNote text={err} />
      <button className="btn btn-primary w-full" disabled={approved < 1 || busy} onClick={next}>{busy && <Spinner />} {t('common.next')}</button>
    </section>
  )
}
