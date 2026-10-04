'use client'
import { use, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { api, Avatar, ErrorNote, Spinner, useLive, useT } from '@/lib/client/ui.tsx'
import type { ConversationView } from '@/lib/domain/inbox.ts'

export default function Chat({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const t = useT()
  const [v, setV] = useState<ConversationView | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const lastKey = useRef('')

  const load = useCallback(async () => {
    try {
      const r = await api<ConversationView>(`/api/conversations/${id}`)
      setV(r)
      if (r.messages.some((m) => m.sender_id !== r.me && !m.read_at)) api(`/api/conversations/${id}`, { body: { action: 'read' } }).catch(() => {})
    } catch (e) { setErr((e as Error).message) }
  }, [id])

  useEffect(() => { load() }, [load])
  useLive((e) => { if (e.conversationId === Number(id) || e.type === 'account') load() })
  useEffect(() => {
    // scroll when a message arrives AND when the last one changes state (checking → delivered / not sent)
    const last = v?.messages[v.messages.length - 1]
    const key = `${v?.messages.length}:${last?.id}:${last?.status}:${v?.conversation.contact_state}`
    if (v && key !== lastKey.current) {
      lastKey.current = key
      requestAnimationFrame(() => end.current?.scrollIntoView({ behavior: 'smooth' }))
    }
  }, [v])

  async function act(body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    setErr(null); setMenu(false)
    try { setV(await api<ConversationView>(`/api/conversations/${id}`, { body })) } catch (e) { setErr((e as Error).message) }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body || !v) return
    setSending(true); setErr(null)
    // optimistic: show it immediately as "checking"
    const temp = { id: -Date.now(), conversation_id: v.conversation.id, sender_id: v.me, body, status: 'PENDING' as const, category: null, user_note: null, created_at: new Date().toISOString(), delivered_at: null, read_at: null }
    setV({ ...v, messages: [...v.messages, temp] })
    setText('')
    try {
      await api(`/api/conversations/${id}`, { body: { action: 'send', body } })
      await load()
    } catch (e) {
      setErr((e as Error).message)
      setText(body)
      await load()
    } finally { setSending(false) }
  }

  if (!v) return <div className="py-24 grid place-items-center text-muted">{err ? <ErrorNote text={err} /> : <Spinner />}</div>
  const c = v.conversation
  const active = c.status === 'ACTIVE'

  return (
    <main className="max-w-lg mx-auto flex flex-col h-[calc(100dvh-5rem)]">
      <header className="flex items-center gap-3 px-3 py-2.5 border-b border-line bg-white sticky top-0 z-10">
        <Link href="/inbox" className="text-maroon text-xl px-1" aria-label={t('common.back')}>←</Link>
        <Link href={`/u/${v.person.id}`} className="flex items-center gap-2.5 min-w-0 flex-1">
          <Avatar photoId={v.person.photo_id} blurred={v.person.photo_blurred} name={v.person.display_name} size={38} />
          <div className="min-w-0">
            <div className="font-semibold truncate">{v.person.display_name}{v.person.age ? `, ${v.person.age}` : ''}</div>
            <div className="text-xs text-muted truncate">{v.person.district}</div>
          </div>
        </Link>
        <div className="relative">
          <button className="px-2 text-xl text-muted" onClick={() => setMenu((m) => !m)} aria-label={t('chat.menu')}>⋮</button>
          {menu && (
            <div className="absolute right-0 top-9 card shadow-lg w-52 py-1 text-sm z-20">
              {active && <button className="w-full text-left px-4 py-2.5 hover:bg-maroon-50" onClick={() => act({ action: 'close' }, t('chat.end') + '?')}>{t('chat.end')}</button>}
              <button className="w-full text-left px-4 py-2.5 hover:bg-maroon-50" onClick={() => act({ action: 'block' }, t('chat.block') + '?')}>{t('chat.block')}</button>
              <button className="w-full text-left px-4 py-2.5 hover:bg-maroon-50 text-red-700" onClick={() => {
                const reason = window.prompt(t('chat.reportWhy'))
                if (reason && reason.trim().length >= 3) act({ action: 'report', reason })
              }}>{t('chat.report')}</button>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2" onClick={() => setMenu(false)}>
        <p className="text-[11px] text-center text-muted bg-gold-light/60 rounded-xl px-3 py-2 mx-4">🛡 {t('chat.safety')}</p>
        {c.status === 'REQUESTED' && (
          <div className="flex justify-end"><div className="max-w-[82%] rounded-2xl px-3.5 py-2 bg-maroon text-white rounded-br-md text-[15px] whitespace-pre-line">{c.intro}</div></div>
        )}
        {v.messages.map((m) => {
          const mine = m.sender_id === v.me
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug whitespace-pre-line break-words
                ${mine ? (m.status === 'BLOCKED' ? 'bg-red-50 text-red-900/60 line-through decoration-red-300 border border-red-200' : 'bg-maroon text-white') + ' rounded-br-md'
                  : 'bg-white border border-line rounded-bl-md'}
                ${m.status === 'PENDING' ? 'opacity-60' : ''}`}>
                {m.body}
              </div>
              <div className="text-[10px] text-muted mt-0.5 px-1 flex gap-1 items-center">
                {m.status === 'PENDING' && <><Spinner /> {t('chat.checking')}</>}
                {m.status === 'BLOCKED' && <span className="text-red-700 font-semibold">{t('chat.notSent')}</span>}
                {m.status === 'DELIVERED' && new Date(m.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                {mine && m.status === 'DELIVERED' && (m.read_at ? ' · ✓✓' : ' · ✓')}
              </div>
              {mine && m.user_note && (
                <div className={`max-w-[82%] text-xs rounded-xl px-3 py-1.5 mt-0.5 ${m.status === 'BLOCKED' ? 'bg-red-50 text-red-800' : 'bg-gold-light text-ink'}`}>{m.user_note}</div>
              )}
            </div>
          )
        })}
        <div ref={end} />
      </div>

      <ContactBar v={v} act={act} />
      <ErrorNote text={err} />
      {active ? (
        <form onSubmit={send} className="flex gap-2 p-2.5 border-t border-line bg-white">
          <textarea className="input !py-2.5 min-h-11 max-h-32 resize-none" rows={1} placeholder={t('chat.placeholder')} value={text} maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); send(e) } }} />
          <button className="btn btn-primary !px-4" disabled={sending || !text.trim()}>{sending ? <Spinner /> : t('common.send')}</button>
        </form>
      ) : (
        <div className="p-4 text-center text-sm text-muted border-t border-line bg-white">
          {c.status === 'REQUESTED' ? (c.mine ? t('chat.request') : <Link className="text-maroon font-semibold" href="/inbox">{t('inbox.requests')} →</Link>) : t('chat.closed')}
        </div>
      )}
    </main>
  )
}

function ContactBar({ v, act }: { v: ConversationView; act: (b: Record<string, unknown>) => void }) {
  const t = useT()
  const c = v.conversation
  if (c.status !== 'ACTIVE') return null
  const box = 'mx-3 mb-2 rounded-xl px-3 py-2 text-sm'
  if (c.contact_state === 'APPROVED' && v.otherPhone) {
    return (
      <div className={`${box} bg-green-50 border border-green-200`}>
        <div className="text-xs text-green-800">{c.contact_note}</div>
        <div className="mt-1">{t('chat.phone')}: <a href={`tel:${v.otherPhone}`} className="font-semibold text-green-900 tracking-wide">{v.otherPhone}</a></div>
      </div>
    )
  }
  if (c.contact_state === 'AI_REVIEW') return <div className={`${box} bg-maroon-50 flex gap-2 items-center`}><Spinner /> {t('chat.contactReview')}</div>
  if (c.contact_state === 'REQUESTED') {
    return c.contact_requested_by_me
      ? <div className={`${box} bg-maroon-50`}>{t('chat.contactWaiting')}</div>
      : (
        <div className={`${box} bg-gold-light flex items-center gap-2`}>
          <div className="flex-1"><b>{v.person.display_name}</b> {t('chat.contactAsk')}</div>
          <button className="btn btn-ghost !py-1.5 !px-3 text-xs" onClick={() => act({ action: 'contact_decline' })}>{t('chat.notYet')}</button>
          <button className="btn btn-primary !py-1.5 !px-3 text-xs" onClick={() => act({ action: 'contact_agree' })}>{t('chat.agree')}</button>
        </div>
      )
  }
  const waiting = c.contact_state === 'NOT_YET' && c.contact_retry_after && new Date(c.contact_retry_after) > new Date()
  return (
    <div className="mx-3 mb-2 flex items-center gap-2">
      {c.contact_note && <div className="flex-1 text-xs text-muted">{c.contact_note}</div>}
      {!c.contact_note && <div className="flex-1" />}
      <button className="btn btn-ghost !py-1.5 !px-3 text-xs shrink-0" disabled={!!waiting} onClick={() => act({ action: 'contact_request' })}>📞 {t('chat.contact')}</button>
    </div>
  )
}
