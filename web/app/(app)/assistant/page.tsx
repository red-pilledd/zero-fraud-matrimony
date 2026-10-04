'use client'
import { useCallback, useEffect, useState } from 'react'
import { api, ErrorNote, Spinner, useLive, useT } from '@/lib/client/ui.tsx'

type Q = { id: number; question: string; answer: string | null; status: string; created_at: string }

export default function Assistant() {
  const t = useT()
  const [items, setItems] = useState<Q[] | null>(null)
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setItems((await api<{ items: Q[] }>('/api/questions')).items) } catch (e) { setErr((e as Error).message) }
  }, [])
  useEffect(() => { load() }, [load])
  useLive((e) => { if (e.type === 'questions') load() })

  async function submit(id: number, skip = false) {
    setBusy(id); setErr(null)
    try { await api('/api/questions', { body: skip ? { id, skip: true } : { id, answer: drafts[id] ?? '' } }); await load() }
    catch (e) { setErr((e as Error).message) } finally { setBusy(null) }
  }

  return (
    <main className="max-w-lg mx-auto px-4 pt-5 space-y-4">
      <header>
        <h1 className="text-xl font-semibold">{t('asst.title')}</h1>
        <p className="text-sm text-muted mt-1">{t('asst.intro')}</p>
      </header>
      <ErrorNote text={err} />
      {!items ? <div className="py-16 grid place-items-center"><Spinner /></div>
        : items.length === 0 ? <div className="card p-8 text-center text-sm text-muted">✨ {t('asst.empty')}</div>
        : items.map((q) => (
          <div key={q.id} className={`card p-4 space-y-3 ${q.status !== 'OPEN' ? 'opacity-70' : ''}`}>
            <p className="font-medium">{q.question}</p>
            {q.status === 'OPEN' ? (<>
              <textarea className="input min-h-20" placeholder={t('asst.answer')} value={drafts[q.id] ?? ''} maxLength={1500}
                onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))} />
              <div className="flex gap-2 justify-end">
                <button className="btn btn-ghost !py-2" disabled={busy === q.id} onClick={() => submit(q.id, true)}>{t('common.skip')}</button>
                <button className="btn btn-primary !py-2" disabled={busy === q.id || !(drafts[q.id] ?? '').trim()} onClick={() => submit(q.id)}>
                  {busy === q.id && <Spinner />} {t('common.send')}
                </button>
              </div>
            </>) : (
              <p className="text-sm text-muted">{q.status === 'ANSWERED' ? `${t('asst.answered')}: ${q.answer}` : t('asst.skipped')}</p>
            )}
          </div>
        ))}
    </main>
  )
}
