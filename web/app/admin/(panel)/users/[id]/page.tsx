import Link from 'next/link'
import { notFound } from 'next/navigation'
import { q, q0 } from '@/lib/server/db.ts'
import { ageFrom, type User } from '@/lib/types.ts'
import { rupees } from '@/lib/server/settings.ts'
import { ActionButton } from '../../../AdminUI.tsx'

export const dynamic = 'force-dynamic'

export default async function Member({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  const u = await q0<User>('SELECT * FROM users WHERE id = $1', [id])
  if (!u) notFound()
  const photos = await q<{ id: number; status: string; is_primary: boolean }>('SELECT id, status, is_primary FROM photos WHERE user_id = $1 ORDER BY is_primary DESC, id', [id])
  const events = await q<{ id: number; kind: string; category: string | null; detail: string | null; created_at: string; resolved_at: string | null; resolution: string | null }>(
    'SELECT id, kind, category, detail, created_at, resolved_at, resolution FROM moderation_events WHERE user_id = $1 ORDER BY id DESC LIMIT 50', [id])
  const convs = await q<{ id: number; status: string; other: number; other_name: string | null; msgs: string; contact_state: string; created_at: string }>(
    `SELECT c.id, c.status, o.id AS other, o.display_name AS other_name, c.contact_state, c.created_at,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.status = 'DELIVERED') AS msgs
       FROM conversations c JOIN users o ON o.id = CASE WHEN c.initiator_id = $1 THEN c.recipient_id ELSE c.initiator_id END
      WHERE c.initiator_id = $1 OR c.recipient_id = $1 ORDER BY c.id DESC`, [id])
  const questions = await q<{ question: string; answer: string | null; status: string }>('SELECT question, answer, status FROM ai_questions WHERE user_id = $1 ORDER BY id DESC LIMIT 20', [id])
  const interview = await q<{ role: string; content: string }>('SELECT role, content FROM interview_turns WHERE user_id = $1 ORDER BY id', [id])
  const ch = u.character as null | {
    summary?: string; traits?: string[]; values?: string[]; communication_style?: string; observed_intent?: string; intent_matches_declared?: boolean
    intent_evidence?: string; respectfulness?: number; sincerity?: number; trust_score?: number; risk_flags?: Array<{ type: string; evidence: string }>
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <section className="card p-5 space-y-3 lg:col-span-1">
        <div className="flex gap-2 overflow-x-auto">
          {photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={`/api/photo/${p.id}`} alt="" className={`h-28 rounded-lg ${p.status !== 'APPROVED' ? 'opacity-50' : ''}`} title={p.status} />
          ))}
        </div>
        <h1 className="text-xl font-semibold">{u.display_name} <span className="text-muted text-base">#{u.id}</span></h1>
        <p className="text-sm text-muted">{u.full_name} · {u.gender} · {ageFrom(u.dob)} · {u.marital_status} · {u.district}</p>
        <p className="text-sm">{u.phone}</p>
        <dl className="text-sm grid grid-cols-2 gap-1">
          <dt className="text-muted">Section</dt><dd><b>{u.pool}</b> ({u.track}{u.dating_purpose ? ` / ${u.dating_purpose}` : ''})</dd>
          <dt className="text-muted">Profile by</dt><dd>{u.created_by}</dd>
          <dt className="text-muted">Status</dt><dd>{u.status}{u.frozen_until ? ` until ${new Date(u.frozen_until).toLocaleString('en-IN')}` : ''}</dd>
          <dt className="text-muted">Selfie</dt><dd>{u.selfie_status}</dd>
          <dt className="text-muted">Strikes</dt><dd>{u.strikes}</dd>
          <dt className="text-muted">Trust</dt><dd>{u.trust_score}</dd>
          <dt className="text-muted">Credit</dt><dd>{rupees(u.credit_paise)}</dd>
          <dt className="text-muted">Messages</dt><dd>{u.msgs_delivered}</dd>
        </dl>
        {u.ban_reason && <p className="text-sm text-red-700">Ban: {u.ban_reason}</p>}
        <div className="flex flex-wrap gap-2 pt-2">
          {u.status === 'BANNED'
            ? <ActionButton label="Unban" body={{ action: 'unban', userId: id }} confirm="Unban?" />
            : <ActionButton label="Ban" tone="danger" body={{ action: 'ban', userId: id, refund: true }} prompt="Reason (shown to the member)" promptKey="reason" />}
          {u.status === 'FROZEN' && <ActionButton label="Unpause" body={{ action: 'unfreeze', userId: id }} />}
          {u.strikes > 0 && <ActionButton label="Clear strikes" body={{ action: 'clear_strikes', userId: id }} />}
          {u.selfie_status !== 'VERIFIED' && <ActionButton label="Approve selfie" body={{ action: 'selfie', userId: id, approve: true }} />}
          <ActionButton label="Add/remove credit (₹)" body={{ action: 'credit', userId: id, note: 'Adjusted by admin' }} prompt="Rupees to add (negative to remove)" promptKey="rupees" numeric />
          <ActionButton label="Ask a private question" body={{ action: 'ask', userId: id }} prompt="Question for the member's assistant" promptKey="question" />
          <ActionButton label="Rebuild character read" body={{ action: 'rebuild_character', userId: id }} />
          {(['MARRIAGE', 'LONG_TERM', 'CASUAL'] as const).filter((p) => p !== u.pool && (p === 'MARRIAGE' || u.created_by === 'SELF')).map((p) => (
            <ActionButton key={p} label={`Move to ${p}`} body={{ action: 'reroute', userId: id, pool: p }} confirm={`Move this member to ${p}?`} />
          ))}
        </div>
        {u.selfie_status !== 'NONE' && (
          // eslint-disable-next-line @next/next/no-img-element
          <figure><img src={`/api/admin/selfie/${id}`} alt="selfie" className="h-40 rounded-lg" /><figcaption className="text-xs text-muted">Latest live selfie</figcaption></figure>
        )}
      </section>

      <section className="card p-5 space-y-3 lg:col-span-2">
        <h2 className="font-semibold">Character read <span className="text-xs text-muted font-normal">(internal — never shown to members) · updated {u.character_updated_at ? new Date(String(u.character_updated_at)).toLocaleString('en-IN') : 'never'}</span></h2>
        {ch ? (
          <div className="text-sm space-y-2">
            <p>{ch.summary}</p>
            <p><b>Traits:</b> {ch.traits?.join(', ')}</p>
            <p><b>Values:</b> {ch.values?.join(', ')}</p>
            <p><b>Style:</b> {ch.communication_style}</p>
            <p><b>Observed intent:</b> {ch.observed_intent} {ch.intent_matches_declared === false && <span className="text-red-700">(does not match their section)</span>} — {ch.intent_evidence}</p>
            <p><b>Respectfulness</b> {ch.respectfulness} · <b>Sincerity</b> {ch.sincerity} · <b>Trust</b> {ch.trust_score}</p>
            {!!ch.risk_flags?.length && <ul className="text-red-800 list-disc pl-5">{ch.risk_flags.map((f, i) => <li key={i}><b>{f.type}</b>: {f.evidence}</li>)}</ul>}
          </div>
        ) : <p className="text-sm text-muted">Not built yet — it builds after the interview and every few messages.</p>}

        <h2 className="font-semibold pt-3">About</h2>
        <p className="text-sm whitespace-pre-line">{u.about}</p>

        <h2 className="font-semibold pt-3">Conversations</h2>
        <table className="w-full text-sm"><tbody>
          {convs.map((c) => (
            <tr key={c.id} className="border-t border-line [&>td]:py-1">
              <td>#{c.id}</td><td><Link href={`/admin/users/${c.other}`} className="text-maroon">{c.other_name} #{c.other}</Link></td>
              <td>{c.status}</td><td>{c.msgs} msgs</td><td>contact: {c.contact_state}</td>
            </tr>))}
        </tbody></table>

        <h2 className="font-semibold pt-3">Moderation history</h2>
        <ul className="text-sm space-y-1">
          {events.map((e) => (
            <li key={e.id} className={e.resolved_at ? 'text-muted' : ''}>
              <span className="chip mr-1">{e.kind}{e.category ? ` · ${e.category}` : ''}</span>{e.detail}
              <span className="text-xs text-muted"> — {new Date(e.created_at).toLocaleString('en-IN')}{e.resolution ? ` · ${e.resolution}` : ''}</span>
            </li>))}
        </ul>

        <details className="pt-3">
          <summary className="font-semibold cursor-pointer">Onboarding interview & private questions</summary>
          <div className="text-sm space-y-1 mt-2">
            {interview.map((t, i) => <p key={i}><b>{t.role === 'ai' ? 'Q' : 'A'}:</b> {t.content}</p>)}
            {questions.map((x, i) => <p key={`q${i}`} className="text-muted"><b>Asked:</b> {x.question} — <i>{x.answer ?? x.status}</i></p>)}
          </div>
        </details>
      </section>
    </div>
  )
}
