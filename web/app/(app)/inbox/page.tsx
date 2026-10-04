'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { api, Avatar, ErrorNote, rupees, Spinner, useLive, useT } from '@/lib/client/ui.tsx'
import type { InboxItem } from '@/lib/domain/inbox.ts'

export default function Inbox() {
  const t = useT()
  const [items, setItems] = useState<InboxItem[] | null>(null)
  const [credit, setCredit] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: InboxItem[]; credit: number }>('/api/conversations')
      setItems(r.items); setCredit(r.credit)
    } catch (e) { setErr((e as Error).message) }
  }, [])
  useEffect(() => { load() }, [load])
  useLive((e) => { if (e.type === 'conversation' || e.type === 'message') load() })

  async function respond(id: number, accept: boolean) {
    setBusy(id); setErr(null)
    try {
      await api(`/api/conversations/${id}`, { body: { action: accept ? 'accept' : 'decline' } })
      if (accept) window.location.href = `/chat/${id}`
      else await load()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(null) }
  }

  if (!items) return <div className="py-24 grid place-items-center text-muted"><Spinner /></div>
  const now = Date.now()
  const requests = items.filter((i) => i.status === 'REQUESTED' && !i.mine && new Date(i.expires_at).getTime() > now)
  const chats = items.filter((i) => i.status === 'ACTIVE')
  const sent = items.filter((i) => i.status === 'REQUESTED' && i.mine)
  const past = items.filter((i) => ['DECLINED', 'EXPIRED', 'CLOSED'].includes(i.status))
  const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

  const Row = ({ i, children }: { i: InboxItem; children?: React.ReactNode }) => (
    <div className="flex gap-3 items-center p-3">
      <Avatar photoId={i.person.photo_id} blurred={i.person.photo_blurred} name={i.person.display_name} size={52} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="font-semibold truncate">{i.person.display_name}{i.person.age ? `, ${i.person.age}` : ''}</div>
          {i.unread > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-gold text-white text-[11px] grid place-items-center">{i.unread}</span>}
        </div>
        {children}
      </div>
    </div>
  )

  return (
    <main className="max-w-lg mx-auto px-4 pt-5 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('inbox.title')}</h1>
        {credit > 0 && <span className="chip">{t('inbox.credit')}: {rupees(credit)}</span>}
      </header>
      <ErrorNote text={err} />

      {requests.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{t('inbox.requests')}</h2>
          <div className="space-y-3">
            {requests.map((i) => (
              <div key={i.id} className="card overflow-hidden">
                <Link href={`/u/${i.person.id}`}><Row i={i}><div className="text-xs text-muted">{i.person.district}</div></Row></Link>
                <p className="px-4 pb-3 text-[15px] whitespace-pre-line">{i.intro}</p>
                <div className="px-4 pb-1 text-xs text-muted">{t('inbox.expires')} {when(i.expires_at)}</div>
                <div className="grid grid-cols-2 gap-2 p-3">
                  <button className="btn btn-ghost" disabled={busy === i.id} onClick={() => respond(i.id, false)}>{t('inbox.decline')}</button>
                  <button className="btn btn-primary" disabled={busy === i.id} onClick={() => respond(i.id, true)}>{busy === i.id && <Spinner />} {t('inbox.accept')}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {chats.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{t('inbox.chats')}</h2>
          <div className="card divide-y divide-line">
            {chats.map((i) => (
              <Link key={i.id} href={`/chat/${i.id}`} className="block hover:bg-maroon-50/40">
                <Row i={i}><div className={`text-sm truncate ${i.unread ? 'text-ink font-medium' : 'text-muted'}`}>{i.last ?? i.intro}</div></Row>
              </Link>
            ))}
          </div>
        </section>
      )}

      {sent.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{t('inbox.sent')}</h2>
          <div className="card divide-y divide-line">
            {sent.map((i) => (
              <Link key={i.id} href={`/chat/${i.id}`} className="block">
                <Row i={i}><div className="text-xs text-muted">{t('inbox.expires')} {when(i.expires_at)}</div></Row>
              </Link>
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{t('inbox.past')}</h2>
          <div className="card divide-y divide-line opacity-80">
            {past.map((i) => (
              <Link key={i.id} href={`/chat/${i.id}`} className="block">
                <Row i={i}>
                  <div className="text-xs text-muted">
                    {i.status === 'DECLINED' ? t('inbox.declined') : i.status === 'EXPIRED' ? t('inbox.expired') : t('inbox.closed')}
                    {i.mine && i.refunded && ` · ${t('inbox.refunded')} (${rupees(i.price_paise)})`}
                  </div>
                </Row>
              </Link>
            ))}
          </div>
        </section>
      )}

      {items.length === 0 && <div className="card p-8 text-center text-sm text-muted">{t('inbox.empty')}</div>}
    </main>
  )
}
