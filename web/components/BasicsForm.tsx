'use client'
import { useState } from 'react'
import { api, ErrorNote, Spinner, useT } from '@/lib/client/ui.tsx'
import { DIETS, DISTRICTS, EDUCATION, HABITS, INCOMES, LANGUAGES, RELIGIONS } from '@/lib/options.ts'

export type Basics = {
  full_name: string | null; display_name: string | null; gender: 'MAN' | 'WOMAN' | null; seeking: string | null; dob: string | null
  height_cm: number | null; marital_status: string | null; religion: string | null; caste: string | null; mother_tongue: string | null
  district: string | null; state: string | null; country: string; education: string | null; occupation: string | null
  income_band: string | null; diet: string | null; drinks: string | null; smokes: string | null
  pref_age_min: number | null; pref_age_max: number | null; photo_visibility: 'MEMBERS' | 'ACCEPTED'
}

export default function BasicsForm({ initial, pool, bySelf, submitLabel, onDone, endpoint }: {
  initial: Basics; pool: string | null; bySelf: boolean; submitLabel: string; onDone: () => void
  endpoint: 'onboarding' | 'me'
}) {
  const t = useT()
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(
    Object.entries(initial).map(([k, val]) => [k, val === null || val === undefined ? '' : String(val)])))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }))
  const marriage = pool === 'MARRIAGE'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const body: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) if (val !== '') body[k] = val
    try {
      if (endpoint === 'me') await api('/api/me', { method: 'PATCH', body: { basics: body } })
      else await api('/api/onboarding/basics', { body })
      onDone()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const sel = (k: string, opts: string[], labels?: (o: string) => string, required = false) => (
    <select className="input" value={v[k] ?? ''} onChange={set(k)} required={required}>
      <option value="">—</option>
      {opts.map((o) => <option key={o} value={o}>{labels ? labels(o) : o}</option>)}
    </select>
  )

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="field col-span-2"><span>{t('f.full_name')}</span>
          <input className="input" value={v.full_name} onChange={set('full_name')} required autoComplete="name" /></label>
        <label className="field col-span-2"><span>{t('f.display_name')}</span>
          <input className="input" value={v.display_name} onChange={set('display_name')} required placeholder="e.g. Anjali" /></label>
        <label className="field"><span>{t('f.gender')}</span>
          {sel('gender', ['MAN', 'WOMAN'], (o) => t(`f.${o}` as 'f.MAN'), true)}</label>
        <label className="field"><span>{t('f.dob')}</span>
          <input className="input" type="date" value={v.dob} onChange={set('dob')} required max={new Date().toISOString().slice(0, 10)} /></label>
        {!marriage && (
          <label className="field col-span-2"><span>{t('f.seeking')}</span>
            {sel('seeking', ['MEN', 'WOMEN', 'EVERYONE'], (o) => t(`f.${o}` as 'f.MEN'))}</label>
        )}
        <label className="field"><span>{t('f.marital_status')}</span>
          {sel('marital_status', ['NEVER_MARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED'], (o) => t(`f.${o}` as 'f.DIVORCED'), true)}</label>
        <label className="field"><span>{t('f.height_cm')}</span>
          <input className="input" type="number" min={120} max={230} value={v.height_cm} onChange={set('height_cm')} placeholder="165" /></label>
        <label className="field"><span>{t('f.district')}</span>
          <input className="input" list="districts" value={v.district} onChange={set('district')} required /></label>
        <label className="field"><span>{t('f.mother_tongue')}</span>{sel('mother_tongue', LANGUAGES)}</label>
        <label className="field"><span>{t('f.religion')}{!marriage && ` (${t('common.optional')})`}</span>{sel('religion', RELIGIONS)}</label>
        {marriage && (
          <label className="field"><span>{t('f.caste')} ({t('common.optional')})</span>
            <input className="input" value={v.caste} onChange={set('caste')} /></label>
        )}
        <label className="field"><span>{t('f.education')}</span>
          <input className="input" list="education" value={v.education} onChange={set('education')} /></label>
        <label className="field"><span>{t('f.occupation')}</span>
          <input className="input" value={v.occupation} onChange={set('occupation')} placeholder="e.g. Nurse, Software engineer" /></label>
        {marriage && <label className="field"><span>{t('f.income_band')}</span>{sel('income_band', INCOMES)}</label>}
        <label className="field"><span>{t('f.diet')}</span>{sel('diet', DIETS)}</label>
        <label className="field"><span>{t('f.drinks')}</span>{sel('drinks', HABITS)}</label>
        <label className="field"><span>{t('f.smokes')}</span>{sel('smokes', HABITS)}</label>
        <div className="field col-span-2"><span>{t('f.pref_age')}</span>
          <div className="flex items-center gap-2">
            <input className="input" type="number" min={18} max={80} value={v.pref_age_min} onChange={set('pref_age_min')} placeholder="21" />
            <span className="text-muted text-sm">–</span>
            <input className="input" type="number" min={18} max={90} value={v.pref_age_max} onChange={set('pref_age_max')} placeholder="35" />
          </div>
        </div>
        <label className="field col-span-2"><span>{t('f.photo_visibility')}</span>
          {sel('photo_visibility', ['MEMBERS', 'ACCEPTED'], (o) => t(`f.${o}` as 'f.MEMBERS'), true)}</label>
      </div>
      <datalist id="districts">{DISTRICTS.map((d) => <option key={d} value={d} />)}</datalist>
      <datalist id="education">{EDUCATION.map((d) => <option key={d} value={d} />)}</datalist>
      {!bySelf && <p className="text-xs text-muted">{t('ob.basics.other')}</p>}
      <ErrorNote text={err} />
      <button className="btn btn-primary w-full" disabled={busy}>{busy && <Spinner />} {submitLabel}</button>
    </form>
  )
}
