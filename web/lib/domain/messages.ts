import 'server-only'
import { q, q0, tx } from '../server/db.ts'
import { publish } from '../server/bus.ts'
import { notify } from '../server/push.ts'
import { DomainError } from '../pg.ts'
import { screenRules } from '../moderation/rules.ts'
import { aiScreen, type ScreenVerdict } from '../ai/screen.ts'
import { AiRefused, AiUnavailable } from '../ai/llm.ts'
import { applyViolation, type Action } from './moderation.ts'
import { maybeRefreshCharacter } from './character.ts'
import type { Pool, User } from '../types.ts'

// The message pipeline:  send → PENDING → rules → AI → DELIVERED | BLOCKED
// The other person can only ever read DELIVERED messages. If the AI is unreachable the message
// simply stays PENDING and the background job retries — nothing is delivered unscreened.

export type MessageRow = {
  id: number
  conversation_id: number
  sender_id: number
  body: string
  status: 'PENDING' | 'DELIVERED' | 'BLOCKED'
  category: string | null
  user_note: string | null
  created_at: string
  delivered_at: string | null
  read_at: string | null
}

type ConvRow = {
  id: number; pool: Pool; initiator_id: number; recipient_id: number; status: string; contact_state: string
}

const RULE_NOTE = {
  en: "Contact details can't be shared yet. Keep talking here — when you're both ready, use “Exchange contacts”.",
  ml: 'ഇപ്പോൾ ഫോൺ നമ്പറോ മറ്റ് ബന്ധപ്പെടാനുള്ള വിവരങ്ങളോ പങ്കിടാനാവില്ല. ഇവിടെ സംസാരം തുടരൂ — രണ്ടുപേരും തയ്യാറാകുമ്പോൾ “നമ്പർ കൈമാറുക” ഉപയോഗിക്കൂ.',
}
const RULE_NOTE_REWRITE = {
  en: "This message couldn't be delivered. Please rephrase it respectfully.",
  ml: 'ഈ സന്ദേശം അയയ്ക്കാനായില്ല. ദയവായി മാന്യമായി മാറ്റിയെഴുതൂ.',
}
const HELP_NOTE = {
  en: "Your message was delivered. If you're going through a hard time, you can talk to someone now: Tele-MANAS 14416 (free, 24×7).",
  ml: 'നിങ്ങളുടെ സന്ദേശം അയച്ചു. മനസ്സ് വിഷമിക്കുന്നുണ്ടെങ്കിൽ ഇപ്പോൾ തന്നെ സംസാരിക്കാം: Tele-MANAS 14416 (സൗജന്യം, 24 മണിക്കൂറും).',
}
const ACTION_SUFFIX: Record<Action, { en: string; ml: string }> = {
  NONE: { en: '', ml: '' },
  CAUTION: { en: '', ml: '' },
  WARNING: { en: ' This is a warning — repeated breaks pause your account.', ml: ' ഇതൊരു മുന്നറിയിപ്പാണ് — ആവർത്തിച്ചാൽ അക്കൗണ്ട് താൽക്കാലികമായി നിർത്തും.' },
  FREEZE: { en: ' Your account is now paused for a few days.', ml: ' നിങ്ങളുടെ അക്കൗണ്ട് കുറച്ചു ദിവസത്തേക്ക് നിർത്തിവച്ചിരിക്കുന്നു.' },
  BAN: { en: ' Your account has been closed.', ml: ' നിങ്ങളുടെ അക്കൗണ്ട് അടച്ചു.' },
}

export async function loadConversationFor(user: User, conversationId: number): Promise<ConvRow> {
  const c = await q0<ConvRow>(
    `SELECT id, pool, initiator_id, recipient_id, status, contact_state FROM conversations
      WHERE id = $1 AND (initiator_id = $2 OR recipient_id = $2)`, [conversationId, user.id])
  if (!c) throw new DomainError('Conversation not found')
  return c
}

export async function sendMessage(user: User, conversationId: number, rawBody: string): Promise<MessageRow> {
  const body = rawBody.replace(/\s+$/g, '').replace(/^\s+/g, '')
  if (!body) throw new DomainError('Type a message first')
  if (body.length > 2000) throw new DomainError('That message is too long (2000 characters max)')
  const c = await loadConversationFor(user, conversationId)
  if (c.status !== 'ACTIVE') throw new DomainError('This conversation is not open for messages')
  const other = c.initiator_id === user.id ? c.recipient_id : c.initiator_id
  const blocked = await q0('SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)', [user.id, other])
  if (blocked) throw new DomainError('This conversation is closed')
  const recent = await q0<{ n: string }>(
    `SELECT COUNT(*) AS n FROM messages WHERE sender_id = $1 AND created_at > now() - interval '1 minute'`, [user.id])
  if (Number(recent?.n ?? 0) >= 20) throw new DomainError('You are sending very fast — wait a moment')

  const [m] = await q<MessageRow>(
    `INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1,$2,$3) RETURNING *`, [conversationId, user.id, body])
  publish(user.id, { type: 'message', conversationId })
  await screenMessage(m.id)
  return (await q0<MessageRow>('SELECT * FROM messages WHERE id = $1', [m.id]))!
}

const inFlight = new Set<number>()

/** Screen one PENDING message. Safe to call repeatedly (job retries); a message is only finalised once. */
export async function screenMessage(messageId: number): Promise<void> {
  if (inFlight.has(messageId)) return
  inFlight.add(messageId)
  try {
    const m = await q0<MessageRow & { attempts: number }>(
      `UPDATE messages SET attempts = attempts + 1 WHERE id = $1 AND status = 'PENDING' RETURNING *`, [messageId])
    if (!m) return
    const c = (await q0<ConvRow>('SELECT id, pool, initiator_id, recipient_id, status, contact_state FROM conversations WHERE id = $1', [m.conversation_id]))!
    const sender = (await q0<User>('SELECT * FROM users WHERE id = $1', [m.sender_id]))!
    const otherId = c.initiator_id === sender.id ? c.recipient_id : c.initiator_id
    const contactApproved = c.contact_state === 'APPROVED'

    if (c.status !== 'ACTIVE' || sender.status === 'BANNED') {
      await finalize(m, c, sender, otherId, { kind: 'BLOCKED', category: 'CLOSED', note: 'This conversation is closed.', screen: { closed: true } })
      return
    }

    const senderRecent = (await q<{ body: string }>(
      `SELECT body FROM messages WHERE conversation_id = $1 AND sender_id = $2 AND id < $3 ORDER BY id DESC LIMIT 4`,
      [c.id, sender.id, m.id])).map((r) => r.body).reverse()
    const rules = screenRules(m.body, { senderRecent, contactApproved })
    const lang = sender.lang

    if (rules.block) {
      await finalize(m, c, sender, otherId, {
        kind: 'BLOCKED', category: rules.block.category, note: RULE_NOTE[lang],
        screen: { layer: 'rules', reason: rules.block.reason, hints: rules.hints },
        violation: { category: 'CONTACT_INFO', severity: 'HIGH', detail: `Rules: ${rules.block.reason}` },
      })
      return
    }

    const history = (await q<{ sender_id: number; body: string }>(
      `SELECT sender_id, body FROM (
         SELECT id, sender_id, body FROM messages
          WHERE conversation_id = $1 AND id < $2 AND status = 'DELIVERED'
          ORDER BY id DESC LIMIT 10) t ORDER BY id`, [c.id, m.id]))
      .map((h) => ({ who: (h.sender_id === sender.id ? 'SENDER' : 'OTHER') as 'SENDER' | 'OTHER', text: h.body }))

    let v: ScreenVerdict
    try {
      v = await aiScreen({
        pool: c.pool, createdByFamily: sender.created_by !== 'SELF', contactApproved,
        history, message: m.body, hints: rules.hints, userId: sender.id,
      })
    } catch (err) {
      if (err instanceof AiRefused) {
        // the model would not even read it — never deliver, no strike, a human looks
        await finalize(m, c, sender, otherId, {
          kind: 'BLOCKED', category: 'UNSCREENABLE', note: RULE_NOTE_REWRITE[lang], screen: { layer: 'ai', refused: err.message },
        })
        await q(`INSERT INTO moderation_events (user_id, conversation_id, message_id, kind, category, detail, needs_review)
                 VALUES ($1,$2,$3,'MESSAGE_BLOCKED','UNSCREENABLE','Screening model refused to process this message', true)`, [sender.id, c.id, m.id])
        return
      }
      if (err instanceof AiUnavailable) {
        console.error(`[screen] message ${m.id} held, AI unavailable: ${err.message}`)
        return // stays PENDING; the job retries
      }
      throw err
    }

    const contactOk = contactApproved && v.category === 'CONTACT_INFO' // approved exchange: contact details are fine
    if (v.verdict === 'BLOCK' && v.category !== 'NONE' && v.category !== 'SELF_HARM' && !contactOk) {
      await finalize(m, c, sender, otherId, {
        kind: 'BLOCKED', category: v.category, note: v.user_note || RULE_NOTE[lang], screen: { layer: 'ai', ...v, hints: rules.hints },
        violation: { category: v.category, severity: v.severity, detail: `AI: ${v.internal}` },
      })
      return
    }
    await finalize(m, c, sender, otherId, {
      kind: 'DELIVERED', category: v.category === 'NONE' || contactOk ? null : v.category,
      note: v.category === 'SELF_HARM' ? HELP_NOTE[lang] : null, screen: { layer: 'ai', ...v, hints: rules.hints },
    })
  } finally {
    inFlight.delete(messageId)
  }
}

type Outcome =
  | { kind: 'DELIVERED'; category: string | null; note: string | null; screen: unknown }
  | { kind: 'BLOCKED'; category: string; note: string; screen: unknown;
      violation?: { category: Parameters<typeof applyViolation>[1]['category']; severity: 'LOW' | 'HIGH'; detail: string } }

async function finalize(m: MessageRow, c: ConvRow, sender: User, otherId: number, o: Outcome) {
  let action = 'NONE' as Action
  await tx(async (db) => {
    if (o.kind === 'DELIVERED') {
      const r = await db.query(
        `UPDATE messages SET status = 'DELIVERED', delivered_at = now(), category = $2, user_note = $3, screen = $4
          WHERE id = $1 AND status = 'PENDING'`, [m.id, o.category, o.note, JSON.stringify(o.screen)])
      if (!r.rowCount) return
      await db.query('UPDATE conversations SET last_msg_at = now() WHERE id = $1', [c.id])
      await db.query('UPDATE users SET msgs_delivered = msgs_delivered + 1 WHERE id = $1', [sender.id])
      if (o.category === 'SELF_HARM') {
        await db.query(
          `INSERT INTO moderation_events (user_id, conversation_id, message_id, kind, category, detail, needs_review)
           VALUES ($1,$2,$3,'SAFETY','SELF_HARM','Member may be at risk — check in.', true)`, [sender.id, c.id, m.id])
      }
    } else {
      const r = await db.query(
        `UPDATE messages SET status = 'BLOCKED', category = $2, user_note = $3, screen = $4 WHERE id = $1 AND status = 'PENDING'`,
        [m.id, o.category, o.note, JSON.stringify(o.screen)])
      if (!r.rowCount) return
      if (o.violation) {
        action = await applyViolation(db, { userId: sender.id, conversationId: c.id, messageId: m.id, ...o.violation })
        const suffix = ACTION_SUFFIX[action][sender.lang]
        if (suffix) await db.query('UPDATE messages SET user_note = user_note || $2 WHERE id = $1', [m.id, suffix])
      }
    }
  })
  publish(sender.id, { type: 'message', conversationId: c.id })
  if (action === 'FREEZE' || action === 'BAN') publish(sender.id, { type: 'account' })
  if (action === 'BAN') publish(otherId, { type: 'conversation', conversationId: c.id })
  if (o.kind === 'DELIVERED') {
    publish(otherId, { type: 'message', conversationId: c.id })
    notify(otherId, { url: `/chat/${c.id}` }).catch(() => {})
    maybeRefreshCharacter(sender.id).catch((e) => console.error('[character]', e.message))
  }
}

/** Messages the viewer may see: everything delivered, plus their own pending/blocked lines. */
export async function listMessages(user: User, conversationId: number, afterId = 0): Promise<MessageRow[]> {
  await loadConversationFor(user, conversationId)
  return q<MessageRow>(
    `SELECT id, conversation_id, sender_id, body, status, category,
            CASE WHEN sender_id = $2 THEN user_note END AS user_note, created_at, delivered_at, read_at
       FROM messages
      WHERE conversation_id = $1 AND id > $3 AND (status = 'DELIVERED' OR sender_id = $2)
      ORDER BY id LIMIT 500`, [conversationId, user.id, afterId])
}

export async function markRead(user: User, conversationId: number) {
  const r = await q<{ id: number }>(
    `UPDATE messages SET read_at = now() WHERE conversation_id = $1 AND sender_id <> $2 AND status = 'DELIVERED' AND read_at IS NULL RETURNING id`,
    [conversationId, user.id])
  if (r.length) {
    const c = await q0<ConvRow>('SELECT initiator_id, recipient_id FROM conversations WHERE id = $1', [conversationId])
    if (c) publish(c.initiator_id === user.id ? c.recipient_id : c.initiator_id, { type: 'message', conversationId })
  }
}
