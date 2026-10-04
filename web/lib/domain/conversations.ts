import 'server-only'
import type pg from 'pg'
import { z } from 'zod'
import { q, q0, tx } from '../server/db.ts'
import { getSettings } from '../server/settings.ts'
import { publish } from '../server/bus.ts'
import { notify } from '../server/push.ts'
import { DomainError } from '../pg.ts'
import { screenRules } from '../moderation/rules.ts'
import { aiScreen } from '../ai/screen.ts'
import { askJson, AiUnavailable } from '../ai/llm.ts'
import { creditRefund } from './moderation.ts'
import type { User } from '../types.ts'

// Conversations are the only thing anyone pays for. One fee opens one conversation with one person.
// No reply within the window, or a decline, and the fee comes back as credit automatically.

export type Conversation = {
  id: number; pool: string; initiator_id: number; recipient_id: number
  status: 'REQUESTED' | 'ACTIVE' | 'DECLINED' | 'EXPIRED' | 'CLOSED'
  intro: string; price_paise: number; paid_via: string; refunded: boolean
  expires_at: string; responded_at: string | null; closed_reason: string | null
  contact_state: 'NONE' | 'REQUESTED' | 'AI_REVIEW' | 'APPROVED' | 'NOT_YET'
  contact_requested_by: number | null; contact_note: string | null; contact_retry_after: string | null
  contact_approved_at: string | null; last_msg_at: string | null; created_at: string
}

/** Everything that must be true before anyone can pay to talk to someone. */
export async function checkCanRequest(user: User, recipientId: number): Promise<User> {
  if (user.onboarding_step !== 'DONE') throw new DomainError('Finish setting up your profile first.')
  if (user.selfie_status !== 'VERIFIED') throw new DomainError('Verify your selfie before starting conversations.')
  if (recipientId === user.id) throw new DomainError('That is your own profile.')
  const r = await q0<User>('SELECT * FROM users WHERE id = $1', [recipientId])
  if (!r || r.status !== 'ACTIVE' || r.onboarding_step !== 'DONE' || r.selfie_status !== 'VERIFIED' || r.pool !== user.pool) {
    throw new DomainError('This profile is not available.')
  }
  if (!genderFits(user, r) || !genderFits(r, user)) throw new DomainError('This profile is not available.')
  const blocked = await q0('SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)', [user.id, r.id])
  if (blocked) throw new DomainError('This profile is not available.')
  const existing = await q0<{ status: string }>(
    `SELECT status FROM conversations WHERE LEAST(initiator_id, recipient_id) = LEAST($1::bigint,$2::bigint)
       AND GREATEST(initiator_id, recipient_id) = GREATEST($1::bigint,$2::bigint)`, [user.id, r.id])
  if (existing) throw new DomainError('You already have a conversation with this person.')
  return r
}

export function genderFits(a: Pick<User, 'seeking' | 'pool' | 'gender'>, b: Pick<User, 'gender'>): boolean {
  if (a.pool === 'MARRIAGE') return a.gender !== b.gender
  if (a.seeking === 'EVERYONE') return true
  return (a.seeking === 'MEN' && b.gender === 'MAN') || (a.seeking === 'WOMEN' && b.gender === 'WOMAN')
}

/** The opening line is screened exactly like a chat message, before any money moves. */
export async function screenIntro(user: User, intro: string): Promise<string> {
  const text = intro.trim()
  if (text.length < 10) throw new DomainError('Write a short note to introduce yourself (at least 10 characters).')
  if (text.length > 500) throw new DomainError('Keep your first note under 500 characters.')
  const rules = screenRules(text, { senderRecent: [], contactApproved: false })
  if (rules.block) throw new DomainError("Your note can't include phone numbers, links or social media IDs. Remove them and try again.")
  let v
  try {
    v = await aiScreen({ pool: user.pool!, createdByFamily: user.created_by !== 'SELF', contactApproved: false, history: [], message: text, hints: rules.hints, userId: user.id })
  } catch (err) {
    if (err instanceof AiUnavailable) throw new DomainError('Our safety check is busy for a moment. Please try again in a minute.')
    throw err
  }
  if (v.verdict === 'BLOCK' && v.category !== 'NONE' && v.category !== 'SELF_HARM') {
    throw new DomainError(v.user_note || 'Please rewrite your note — it breaks our community rules.')
  }
  return text
}

/** Creates the conversation inside a transaction the caller owns (credit path or verified payment path). */
export async function createConversation(
  db: pg.PoolClient, a: { initiator: User; recipientId: number; intro: string; price: number; paidVia: 'CREDIT' | 'GATEWAY'; paymentId?: number },
): Promise<number> {
  const s = await getSettings()
  try {
    await db.query('SAVEPOINT conv')
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO conversations (pool, initiator_id, recipient_id, intro, price_paise, paid_via, payment_id, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now() + make_interval(hours => $8)) RETURNING id`,
      [a.initiator.pool, a.initiator.id, a.recipientId, a.intro, a.price, a.paidVia, a.paymentId ?? null, s.reply_window_hours])
    await db.query('RELEASE SAVEPOINT conv')
    return rows[0].id
  } catch (err) {
    await db.query('ROLLBACK TO SAVEPOINT conv')
    if ((err as { code?: string }).code === '23505') throw new DomainError('You already have a conversation with this person.')
    throw err
  }
}

export async function startWithCredit(user: User, recipientId: number, intro: string): Promise<number> {
  const s = await getSettings()
  const price = s.price_paise[user.pool!]
  const id = await tx(async (db) => {
    const { rows } = await db.query<{ credit_paise: number }>('SELECT credit_paise FROM users WHERE id = $1 FOR UPDATE', [user.id])
    if (rows[0].credit_paise < price) throw new DomainError('Not enough credit.')
    const cid = await createConversation(db, { initiator: user, recipientId, intro, price, paidVia: 'CREDIT' })
    await db.query('UPDATE users SET credit_paise = credit_paise - $2 WHERE id = $1', [user.id, price])
    await db.query(`INSERT INTO credit_ledger (user_id, delta_paise, reason, conversation_id) VALUES ($1,$2,'SPENT',$3)`, [user.id, -price, cid])
    return cid
  })
  afterRequest(recipientId, id)
  return id
}

export function afterRequest(recipientId: number, conversationId: number) {
  publish(recipientId, { type: 'conversation', conversationId })
  notify(recipientId, { url: '/inbox' }).catch(() => {})
}

export async function respond(user: User, conversationId: number, accept: boolean) {
  const c = await tx(async (db) => {
    const { rows } = await db.query<Conversation>('SELECT * FROM conversations WHERE id = $1 AND recipient_id = $2 FOR UPDATE', [conversationId, user.id])
    const c = rows[0]
    if (!c) throw new DomainError('Request not found')
    if (c.status !== 'REQUESTED') throw new DomainError('This request is no longer open')
    if (new Date(c.expires_at) < new Date()) throw new DomainError('This request has expired')
    if (accept) {
      await db.query(`UPDATE conversations SET status = 'ACTIVE', responded_at = now(), last_msg_at = now() WHERE id = $1`, [c.id])
      // the screened intro becomes the first line of the chat
      await db.query(
        `INSERT INTO messages (conversation_id, sender_id, body, status, delivered_at, created_at, screen)
         VALUES ($1,$2,$3,'DELIVERED',$4,$4,'{"layer":"intro"}')`, [c.id, c.initiator_id, c.intro, c.created_at])
    } else {
      await db.query(`UPDATE conversations SET status = 'DECLINED', responded_at = now() WHERE id = $1`, [c.id])
      await creditRefund(db, c.initiator_id, c.price_paise, 'REFUND_DECLINED', c.id, 'They declined — your fee is back as credit.')
    }
    return c
  })
  publish(c.initiator_id, { type: 'conversation', conversationId })
  notify(c.initiator_id, { url: accept ? `/chat/${conversationId}` : '/inbox' }).catch(() => {})
}

/** Background job: unanswered requests past their window → refunded as credit. */
export async function expireRequests(): Promise<number> {
  const due = await q<{ id: number }>(`SELECT id FROM conversations WHERE status = 'REQUESTED' AND expires_at < now() LIMIT 200`)
  for (const { id } of due) {
    const c = await tx(async (db) => {
      const { rows } = await db.query<Conversation>(
        `UPDATE conversations SET status = 'EXPIRED' WHERE id = $1 AND status = 'REQUESTED' RETURNING *`, [id])
      if (!rows[0]) return null
      await creditRefund(db, rows[0].initiator_id, rows[0].price_paise, 'REFUND_NO_REPLY', id, 'No reply in time — your fee is back as credit.')
      return rows[0]
    })
    if (c) {
      publish(c.initiator_id, { type: 'conversation', conversationId: id })
      publish(c.recipient_id, { type: 'conversation', conversationId: id })
      notify(c.initiator_id, { url: '/inbox' }).catch(() => {})
    }
  }
  return due.length
}

export async function closeConversation(user: User, conversationId: number, opts: { block: boolean; report?: string }) {
  const c = await tx(async (db) => {
    const { rows } = await db.query<Conversation>(
      'SELECT * FROM conversations WHERE id = $1 AND (initiator_id = $2 OR recipient_id = $2) FOR UPDATE', [conversationId, user.id])
    const c = rows[0]
    if (!c) throw new DomainError('Conversation not found')
    const otherId = c.initiator_id === user.id ? c.recipient_id : c.initiator_id
    if (c.status === 'REQUESTED' && c.recipient_id === user.id) {
      await db.query(`UPDATE conversations SET status = 'DECLINED', responded_at = now() WHERE id = $1`, [c.id])
      await creditRefund(db, c.initiator_id, c.price_paise, 'REFUND_DECLINED', c.id, 'They declined — your fee is back as credit.')
    } else if (c.status === 'ACTIVE' || c.status === 'REQUESTED') {
      await db.query(`UPDATE conversations SET status = 'CLOSED', closed_by = $2, closed_reason = $3 WHERE id = $1`,
        [c.id, user.id, opts.block ? 'BLOCKED' : 'ENDED'])
    }
    if (opts.block) {
      await db.query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [user.id, otherId])
    }
    if (opts.report) {
      await db.query(
        `INSERT INTO moderation_events (user_id, reporter_id, conversation_id, kind, detail, needs_review)
         VALUES ($1,$2,$3,'REPORT',$4,true)`, [otherId, user.id, c.id, opts.report.slice(0, 1000)])
    }
    return { ...c, otherId }
  })
  publish(c.otherId, { type: 'conversation', conversationId })
  publish(user.id, { type: 'conversation', conversationId })
}

// ---------------- contact exchange ----------------

/** Contact-exchange notes are seen by both people, who may use different languages: store both. */
const bi = (en: string, ml: string) => JSON.stringify({ en, ml })
export function pickNote(note: string | null, lang: 'en' | 'ml'): string | null {
  if (!note) return null
  try { const o = JSON.parse(note) as { en?: string; ml?: string }; return (lang === 'ml' ? o.ml : o.en) ?? o.en ?? null } catch { return note }
}

const ContactDecision = z.object({
  decision: z.preprocess((v) => String(v).toUpperCase(), z.enum(['APPROVE', 'NOT_YET', 'DENY'])),
  note_for_both: z.string().max(500).catch(''),
  note_for_both_ml: z.string().max(800).catch(''),
  internal: z.string().max(600).catch(''),
})

const CONTACT_SYSTEM = `Two members of an Indian matrimony & relationships platform have BOTH asked to exchange phone numbers.
You decide whether that is safe yet. Read the whole conversation. APPROVE when: both have engaged genuinely over time, both are
respectful, nothing suggests a scam (money, investment, sob stories, rushing intimacy), coercion, a fake identity, or that one
side is pushing while the other is hesitant. NOT_YET when it simply feels too early or one-sided — they should talk a bit more.
DENY when you see real danger signs (scam pattern, threats, pressure, deception) — the members will only be told "not yet",
and a moderator will look. note_for_both: one warm sentence both members will see (never reveal suspicion or accuse anyone).
note_for_both_ml: the same sentence in simple, natural Malayalam.
internal: one line for the moderator.
Output exactly: {"decision":"APPROVE|NOT_YET|DENY","note_for_both":"...","note_for_both_ml":"...","internal":"..."}`

export async function requestContact(user: User, conversationId: number) {
  const c = await getConv(user, conversationId)
  if (c.status !== 'ACTIVE') throw new DomainError('This conversation is not active')
  if (c.contact_state === 'APPROVED') throw new DomainError('You have already exchanged contacts')
  if (c.contact_state === 'AI_REVIEW') throw new DomainError('Already being checked')
  if (c.contact_state === 'NOT_YET' && c.contact_retry_after && new Date(c.contact_retry_after) > new Date()) {
    throw new DomainError(`You can ask again after ${fmt(c.contact_retry_after)}.`)
  }
  if (c.contact_state === 'REQUESTED' && c.contact_requested_by !== user.id) {
    return agreeContact(user, conversationId, true)
  }
  if (c.contact_state === 'REQUESTED') throw new DomainError('Waiting for them to agree')
  await q(`UPDATE conversations SET contact_state = 'REQUESTED', contact_requested_by = $2, contact_note = NULL WHERE id = $1`, [c.id, user.id])
  bump(c)
}

export async function agreeContact(user: User, conversationId: number, agree: boolean) {
  const c = await getConv(user, conversationId)
  if (c.contact_state !== 'REQUESTED' || c.contact_requested_by === user.id) throw new DomainError('Nothing to answer')
  if (!agree) {
    await q(`UPDATE conversations SET contact_state = 'NONE', contact_requested_by = NULL,
               contact_note = $2 WHERE id = $1`,
      [c.id, bi('Not yet — they would like to keep talking here for now.', 'ഇപ്പോൾ വേണ്ട — അവർ കുറച്ചുകൂടി ഇവിടെ സംസാരിക്കാൻ ആഗ്രഹിക്കുന്നു.')])
    bump(c)
    return
  }
  await q(`UPDATE conversations SET contact_state = 'AI_REVIEW', contact_review_started = now() WHERE id = $1`, [c.id])
  bump(c)
  await reviewContact(c.id)
}

export async function reviewContact(conversationId: number) {
  const s = await getSettings()
  const c = (await q0<Conversation>('SELECT * FROM conversations WHERE id = $1', [conversationId]))!
  if (c.contact_state !== 'AI_REVIEW') return
  const counts = await q<{ sender_id: number; n: string }>(
    `SELECT sender_id, COUNT(*) AS n FROM messages WHERE conversation_id = $1 AND status = 'DELIVERED' GROUP BY sender_id`, [c.id])
  const n = (id: number) => Number(counts.find((r) => r.sender_id === id)?.n ?? 0)
  const total = n(c.initiator_id) + n(c.recipient_id)
  const hours = (Date.now() - new Date(c.responded_at ?? c.created_at).getTime()) / 3_600_000

  const notYet = async (note: string, retryHours: number, ai?: unknown) => {
    await q(`UPDATE conversations SET contact_state = 'NOT_YET', contact_requested_by = NULL, contact_note = $2,
               contact_retry_after = now() + make_interval(hours => $3), contact_ai = $4 WHERE id = $1`,
      [c.id, note, Math.max(1, Math.ceil(retryHours)), ai ? JSON.stringify(ai) : null])
    bump(c)
  }

  if (total < s.contact_min_messages || n(c.initiator_id) < s.contact_min_each || n(c.recipient_id) < s.contact_min_each || hours < s.contact_min_hours) {
    const wait = Math.max(s.contact_min_hours - hours, 1)
    return notYet(bi(
      `It's a little early — keep talking here a while longer (we look for at least ${s.contact_min_messages} messages over ${s.contact_min_hours} hours, with both of you taking part).`,
      `അൽപം നേരത്തെയാണ് — കുറച്ചുകൂടി ഇവിടെ സംസാരിക്കൂ (രണ്ടുപേരും പങ്കെടുക്കുന്ന കുറഞ്ഞത് ${s.contact_min_messages} സന്ദേശങ്ങളും ${s.contact_min_hours} മണിക്കൂറും ഞങ്ങൾ നോക്കുന്നു).`), wait)
  }

  const people = await q<User>('SELECT * FROM users WHERE id = ANY($1)', [[c.initiator_id, c.recipient_id]])
  const risky = people.some((p) => p.strikes >= s.strike_freeze_at || p.status !== 'ACTIVE')
  const flags = await q<{ user_id: number; category: string; detail: string }>(
    `SELECT user_id, category, detail FROM moderation_events WHERE user_id = ANY($1) AND kind IN ('RISK_FLAG','REPORT') AND resolved_at IS NULL`,
    [[c.initiator_id, c.recipient_id]])
  if (risky || flags.some((f) => f.category === 'SCAM_PATTERN')) {
    await q(`INSERT INTO moderation_events (user_id, conversation_id, kind, category, detail, needs_review)
             VALUES ($1,$2,'RISK_FLAG','CONTACT_HELD','Contact exchange held automatically: strikes or open scam flag', true)`,
      [c.initiator_id, c.id])
    return notYet(bi('Not yet — keep getting to know each other here a little longer.', 'ഇപ്പോൾ വേണ്ട — കുറച്ചുകൂടി ഇവിടെ പരസ്പരം അറിയൂ.'), s.contact_retry_hours)
  }

  const transcript = await q<{ sender_id: number; body: string; created_at: string }>(
    `SELECT sender_id, body, created_at FROM (SELECT id, sender_id, body, created_at FROM messages
       WHERE conversation_id = $1 AND status = 'DELIVERED' ORDER BY id DESC LIMIT 200) t ORDER BY id`, [c.id])
  const label = (id: number) => (id === c.initiator_id ? 'A' : 'B')
  const describe = (p: User) => `${label(p.id)}: trust ${p.trust_score}/100, strikes ${p.strikes}, profile by ${p.created_by}`
  const prompt = [
    `Conversation open for ${Math.round(hours)} hours. Messages: A ${n(c.initiator_id)}, B ${n(c.recipient_id)}.`,
    people.map(describe).join('\n'),
    flags.length ? `Open notes: ${flags.map((f) => `${label(f.user_id)} ${f.category}: ${f.detail}`).join(' | ')}` : 'No open moderator notes.',
    '', 'CONVERSATION:',
    transcript.map((m) => `${label(m.sender_id)}: ${m.body}`).join('\n'),
  ].join('\n')

  let d
  try {
    d = await askJson('deep', ContactDecision, CONTACT_SYSTEM, [{ role: 'user', text: prompt }], { maxTokens: 3000, effort: 'medium' })
  } catch (err) {
    if (!(err instanceof AiUnavailable)) throw err
    // could not check → do not approve; let them try again shortly
    return notYet(bi('Our check is busy right now — please try again in a little while.', 'ഇപ്പോൾ പരിശോധന തിരക്കിലാണ് — അൽപം കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കൂ.'), 1)
  }
  if (d.decision === 'APPROVE') {
    await q(`UPDATE conversations SET contact_state = 'APPROVED', contact_approved_at = now(), contact_note = $2, contact_ai = $3 WHERE id = $1`,
      [c.id, bi(d.note_for_both, d.note_for_both_ml || d.note_for_both), JSON.stringify(d)])
    bump(c)
    notify(c.initiator_id, { url: `/chat/${c.id}` }).catch(() => {})
    notify(c.recipient_id, { url: `/chat/${c.id}` }).catch(() => {})
    return
  }
  if (d.decision === 'DENY') {
    await q(`INSERT INTO moderation_events (user_id, conversation_id, kind, category, detail, needs_review)
             VALUES ($1,$2,'RISK_FLAG','CONTACT_DENIED',$3,true)`, [c.initiator_id, c.id, d.internal])
  }
  return notYet(d.decision === 'DENY' ? bi('Not yet — keep getting to know each other here a little longer.', 'ഇപ്പോൾ വേണ്ട — കുറച്ചുകൂടി ഇവിടെ പരസ്പരം അറിയൂ.') : bi(d.note_for_both, d.note_for_both_ml || d.note_for_both), s.contact_retry_hours, d)
}

async function getConv(user: User, id: number): Promise<Conversation> {
  const c = await q0<Conversation>('SELECT * FROM conversations WHERE id = $1 AND (initiator_id = $2 OR recipient_id = $2)', [id, user.id])
  if (!c) throw new DomainError('Conversation not found')
  return c
}

function bump(c: { id: number; initiator_id: number; recipient_id: number }) {
  publish(c.initiator_id, { type: 'conversation', conversationId: c.id })
  publish(c.recipient_id, { type: 'conversation', conversationId: c.id })
}

const fmt = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
