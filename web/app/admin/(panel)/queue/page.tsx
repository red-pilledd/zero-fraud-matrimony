import Link from 'next/link'
import { q } from '@/lib/server/db.ts'
import { ActionButton } from '../../AdminUI.tsx'

export const dynamic = 'force-dynamic'

type Ev = {
  id: number; user_id: number; reporter_id: number | null; conversation_id: number | null; message_id: number | null; kind: string
  category: string | null; detail: string | null; created_at: string
  name: string | null; pool: string | null; status: string; strikes: number; trust_score: number; created_by: string; phone: string
}

const PRIORITY = `CASE e.kind WHEN 'SAFETY' THEN 0 WHEN 'BAN' THEN 1 WHEN 'REPORT' THEN 2 WHEN 'RISK_FLAG' THEN 3 WHEN 'FREEZE' THEN 4
  WHEN 'SELFIE_REVIEW' THEN 5 WHEN 'PHOTO_REVIEW' THEN 6 WHEN 'INTENT_MISMATCH' THEN 7 ELSE 8 END`

export default async function Queue() {
  const events = await q<Ev>(
    `SELECT e.*, u.display_name AS name, u.pool, u.status, u.strikes, u.trust_score, u.created_by, u.phone
       FROM moderation_events e JOIN users u ON u.id = e.user_id
      WHERE e.needs_review AND e.resolved_at IS NULL ORDER BY ${PRIORITY}, e.id DESC LIMIT 100`)
  const msgIds = events.filter((e) => e.conversation_id).map((e) => e.conversation_id!)
  const context = msgIds.length ? await q<{ conversation_id: number; id: number; sender_id: number; body: string; status: string; category: string | null }>(
    `SELECT conversation_id, id, sender_id, body, status, category FROM (
       SELECT m.*, ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY id DESC) AS rn FROM messages m WHERE conversation_id = ANY($1)
     ) t WHERE rn <= 12 ORDER BY conversation_id, id`, [msgIds]) : []
  const photoIds = events.filter((e) => e.kind === 'PHOTO_REVIEW').map((e) => Number(/^Photo (\d+):/.exec(e.detail ?? '')?.[1] ?? 0))
  const refPhotos = await q<{ user_id: number; id: number }>(
    `SELECT user_id, id FROM photos WHERE user_id = ANY($1) AND status = 'APPROVED' ORDER BY is_primary DESC, id`,
    [events.filter((e) => e.kind === 'SELFIE_REVIEW').map((e) => e.user_id)])

  if (!events.length) return <div className="card p-10 text-center text-muted">Nothing to review. 🎉</div>

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Review queue <span className="text-muted text-base">({events.length})</span></h1>
      {events.map((e, i) => (
        <div key={e.id} className={`card p-4 ${e.kind === 'SAFETY' || e.kind === 'BAN' ? 'border-red-300' : ''}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <span className="chip mr-2">{e.kind}{e.category ? ` · ${e.category}` : ''}</span>
              <Link href={`/admin/users/${e.user_id}`} className="font-semibold text-maroon">{e.name ?? 'Unnamed'} #{e.user_id}</Link>
              <span className="text-xs text-muted ml-2">{e.pool} · {e.status} · {e.strikes} strikes · trust {e.trust_score} · {e.created_by}</span>
            </div>
            <span className="text-xs text-muted">{new Date(e.created_at).toLocaleString('en-IN')}</span>
          </div>
          {e.detail && <p className="text-sm mt-2">{e.detail}</p>}
          {e.reporter_id && <p className="text-xs text-muted mt-1">Reported by <Link className="text-maroon" href={`/admin/users/${e.reporter_id}`}>#{e.reporter_id}</Link></p>}

          {e.conversation_id && (
            <div className="mt-3 bg-cream rounded-xl p-3 space-y-1 max-h-72 overflow-y-auto text-sm">
              {context.filter((m) => m.conversation_id === e.conversation_id).map((m) => (
                <div key={m.id} className={`${m.id === e.message_id ? 'bg-red-50 rounded px-1' : ''}`}>
                  <b className={m.sender_id === e.user_id ? 'text-maroon' : 'text-ink'}>#{m.sender_id}:</b>{' '}
                  <span className={m.status === 'BLOCKED' ? 'line-through text-red-800' : ''}>{m.body}</span>
                  {m.status === 'BLOCKED' && <span className="text-xs text-red-700"> [blocked {m.category}]</span>}
                </div>
              ))}
            </div>
          )}

          {e.kind === 'SELFIE_REVIEW' && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <figure><img src={`/api/admin/selfie/${e.user_id}`} alt="selfie" className="h-48 rounded-lg" /><figcaption className="text-xs text-center">Live selfie</figcaption></figure>
              {refPhotos.filter((p) => p.user_id === e.user_id).slice(0, 3).map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <figure key={p.id}><img src={`/api/photo/${p.id}`} alt="" className="h-48 rounded-lg" /><figcaption className="text-xs text-center">Profile</figcaption></figure>
              ))}
            </div>
          )}
          {e.kind === 'PHOTO_REVIEW' && photoIds[i] > 0 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/photo/${photoIds[i]}`} alt="" className="h-48 rounded-lg mt-3" />
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton label="Dismiss" body={{ action: 'resolve', eventId: e.id }} />
            {e.kind === 'SELFIE_REVIEW' && <>
              <ActionButton label="Approve selfie" tone="primary" body={{ action: 'selfie', userId: e.user_id, approve: true }} />
              <ActionButton label="Reject selfie" tone="danger" body={{ action: 'selfie', userId: e.user_id, approve: false }} />
            </>}
            {e.kind === 'PHOTO_REVIEW' && photoIds[i] > 0 && <>
              <ActionButton label="Approve photo" tone="primary" body={{ action: 'photo', photoId: photoIds[i], approve: true }} />
              <ActionButton label="Reject photo" tone="danger" body={{ action: 'photo', photoId: photoIds[i], approve: false }} />
            </>}
            {e.kind === 'INTENT_MISMATCH' && e.category && ['MARRIAGE', 'LONG_TERM', 'CASUAL'].includes(e.category) && (
              <ActionButton label={`Move to ${e.category}`} tone="primary" body={{ action: 'reroute', userId: e.user_id, pool: e.category }} />
            )}
            {e.kind === 'INTENT_MISMATCH' && (
              <ActionButton label="Ask them privately" body={{ action: 'ask', userId: e.user_id }} prompt="Question for the member's assistant" promptKey="question" />
            )}
            {e.status === 'BANNED'
              ? <ActionButton label="Unban" body={{ action: 'unban', userId: e.user_id }} confirm="Unban this member?" />
              : <ActionButton label="Ban" tone="danger" body={{ action: 'ban', userId: e.user_id, refund: true }} prompt="Reason (shown to the member)" promptKey="reason" />}
            {e.status === 'FROZEN' && <ActionButton label="Unpause" body={{ action: 'unfreeze', userId: e.user_id }} />}
            <span className="text-xs text-muted self-center">{e.phone}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
