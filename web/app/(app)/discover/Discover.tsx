'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { api, ErrorNote, Spinner, useT } from '@/lib/client/ui.tsx'
import { DISTRICTS, RELIGIONS } from '@/lib/options.ts'
import type { Card } from '@/lib/domain/discover.ts'

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Thuna'

export default function Discover({ pool, selfie, defaults }: { pool: string; selfie: string; defaults: { ageMin: number | null; ageMax: number | null } }) {
  const t = useT()
  const [cards, setCards] = useState<Card[] | null>(null)
  const [page, setPage] = useState(0)
  const [more, setMore] = useState(false)
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ ageMin: defaults.ageMin?.toString() ?? '', ageMax: defaults.ageMax?.toString() ?? '', religion: '', district: '', marital: '' })
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async (p: number, filters = f) => {
    setErr(null)
    const qs = new URLSearchParams(Object.entries({ ...filters, page: String(p) }).filter(([, v]) => v) as [string, string][])
    try {
      const r = await api<{ cards: Card[] }>(`/api/discover?${qs}`)
      setCards((prev) => (p === 0 ? r.cards : [...(prev ?? []), ...r.cards]))
      setMore(r.cards.length === 20)
      setPage(p)
    } catch (e) { setErr((e as Error).message) }
  }, [f])

  useEffect(() => { load(0) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }))

  return (
    <main className="max-w-lg mx-auto px-4 pt-5">
      <header className="flex items-center justify-between mb-4">
        <div>
          <div className="font-serif text-xl font-bold text-maroon">{BRAND}</div>
          <h1 className="text-sm text-muted">{t('disc.title')}</h1>
        </div>
        <button className="btn btn-ghost !py-2 text-sm" onClick={() => setOpen((o) => !o)}>{t('disc.filters')}</button>
      </header>

      {selfie === 'REVIEW' && <p className="text-sm bg-gold-light rounded-xl px-3 py-2 mb-4">{t('disc.pendingSelfie')}</p>}

      {open && (
        <div className="card p-4 mb-4 grid grid-cols-2 gap-3">
          <label className="field"><span>{t('disc.age')}</span>
            <div className="flex gap-1 items-center">
              <input className="input" type="number" min={18} placeholder="18" value={f.ageMin} onChange={set('ageMin')} />–
              <input className="input" type="number" min={18} placeholder="60" value={f.ageMax} onChange={set('ageMax')} />
            </div>
          </label>
          <label className="field"><span>{t('f.district')}</span>
            <select className="input" value={f.district} onChange={set('district')}>
              <option value="">{t('disc.any')}</option>{DISTRICTS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
          {pool === 'MARRIAGE' && (
            <label className="field"><span>{t('f.religion')}</span>
              <select className="input" value={f.religion} onChange={set('religion')}>
                <option value="">{t('disc.any')}</option>{RELIGIONS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </label>
          )}
          <label className="field"><span>{t('f.marital_status')}</span>
            <select className="input" value={f.marital} onChange={set('marital')}>
              <option value="">{t('disc.any')}</option>
              {(['NEVER_MARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED'] as const).map((m) => <option key={m} value={m}>{t(`f.${m}`)}</option>)}
            </select>
          </label>
          <button className="btn btn-primary col-span-2" onClick={() => { setOpen(false); load(0) }}>{t('disc.apply')}</button>
        </div>
      )}

      <ErrorNote text={err} />
      {cards === null ? (
        <div className="py-20 grid place-items-center text-muted"><Spinner /></div>
      ) : cards.length === 0 ? (
        <div className="card p-8 text-center text-muted text-sm">{t('disc.empty')}</div>
      ) : (
        <div className="space-y-4">
          {cards.map((c) => (
            <Link key={c.id} href={`/u/${c.id}`} className="card block overflow-hidden hover:border-gold transition">
              <div className="relative aspect-[4/3] bg-maroon-50">
                {c.photo_id && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/photo/${c.photo_id}`} alt={c.display_name} className="w-full h-full object-cover" />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
                  <div className="text-xl font-semibold">{c.display_name}{c.age ? `, ${c.age}` : ''}</div>
                  <div className="text-sm opacity-90">{[c.occupation, c.district].filter(Boolean).join(' · ')}</div>
                </div>
                <span className="chip absolute top-3 left-3 !bg-white/90">✓ {t('common.verified')}</span>
                {c.photo_blurred && <span className="chip absolute top-3 right-3 !bg-white/90">🔒</span>}
              </div>
              <div className="p-4">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {c.marital_status && <span className="chip !bg-maroon-50 !text-maroon">{t(`f.${c.marital_status}` as 'f.DIVORCED')}</span>}
                  {c.religion && <span className="chip !bg-maroon-50 !text-maroon">{c.religion}</span>}
                  {c.height_cm && <span className="chip !bg-maroon-50 !text-maroon">{c.height_cm} cm</span>}
                  {c.created_by !== 'SELF' && <span className="chip">{t('disc.byFamily')}</span>}
                </div>
                {c.about && <p className="text-sm text-muted line-clamp-3">{c.about}</p>}
              </div>
            </Link>
          ))}
          {more && <button className="btn btn-ghost w-full" onClick={() => load(page + 1)}>{t('disc.more')}</button>}
        </div>
      )}
    </main>
  )
}
