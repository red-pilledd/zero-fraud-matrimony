import 'server-only'
import type pg from 'pg'
import { getSettings } from '../server/settings.ts'
import type { Category } from '../ai/screen.ts'

// What happens to an account when a message breaks the rules. Deterministic: the AI only
// classifies the message; this table of consequences is plain code an operator can reason about.

const SEVERE: Category[] = ['SCAM', 'SOLICITATION', 'THREAT']
export type Action = 'NONE' | 'CAUTION' | 'WARNING' | 'FREEZE' | 'BAN'

export async function applyViolation(
  db: pg.PoolClient,
  v: { userId: number; category: Category; severity: 'LOW' | 'HIGH'; conversationId?: number; messageId?: number; detail: string },
): Promise<Action> {
  const s = await getSettings()
  const ev = (kind: string, needsReview: boolean, detail = v.detail) =>
    db.query(
      `INSERT INTO moderation_events (user_id, conversation_id, message_id, kind, category, detail, needs_review)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [v.userId, v.conversationId ?? null, v.messageId ?? null, kind, v.category, detail, needsReview],
    )

  if (v.category === 'MINOR') {
    await ev('BAN', true, `Possible under-18 user. ${v.detail}`)
    await banUser(db, v.userId, 'Members must be 18 or older.', true)
    return 'BAN'
  }
  if (SEVERE.includes(v.category) && v.severity === 'HIGH') {
    await ev('BAN', true)
    await banUser(db, v.userId, banText(v.category), true)
    return 'BAN'
  }
  if (v.severity === 'LOW' && !SEVERE.includes(v.category)) {
    // borderline: the message is held back, the account is not penalised
    await ev('MESSAGE_BLOCKED', false)
    return 'CAUTION'
  }

  const { rows } = await db.query<{ strikes: number }>(
    'UPDATE users SET strikes = strikes + 1 WHERE id = $1 RETURNING strikes', [v.userId])
  const strikes = rows[0].strikes
  const review = SEVERE.includes(v.category) || v.category === 'HATE'
  if (strikes >= s.strike_ban_at) {
    await ev('BAN', true, `Strike ${strikes}. ${v.detail}`)
    await banUser(db, v.userId, `Repeated rule breaks (${strikes} strikes).`, false)
    return 'BAN'
  }
  if (strikes >= s.strike_freeze_at) {
    await ev('FREEZE', review, `Strike ${strikes}. ${v.detail}`)
    await db.query(
      `UPDATE users SET status = 'FROZEN', frozen_until = now() + make_interval(days => $2) WHERE id = $1 AND status <> 'BANNED'`,
      [v.userId, s.freeze_days])
    return 'FREEZE'
  }
  await ev('WARNING', review, `Strike ${strikes}. ${v.detail}`)
  return 'WARNING'
}

function banText(c: Category): string {
  switch (c) {
    case 'SCAM': return 'Asking members for money or promoting money schemes.'
    case 'SOLICITATION': return 'Offering or seeking paid sexual services.'
    case 'THREAT': return 'Threatening another member.'
    default: return 'Breaking the community rules.'
  }
}

/**
 * Close the account, sign it out everywhere, end its conversations.
 * refundVictims: people who paid to talk to this account get their fee back as credit.
 */
export async function banUser(db: pg.PoolClient, userId: number, reason: string, refundVictims: boolean) {
  await db.query(
    `UPDATE users SET status = 'BANNED', ban_reason = $2, session_version = session_version + 1 WHERE id = $1`,
    [userId, reason])
  const { rows } = await db.query<{ id: number; initiator_id: number; price_paise: number; refunded: boolean; status: string }>(
    `SELECT id, initiator_id, price_paise, refunded, status FROM conversations
      WHERE (initiator_id = $1 OR recipient_id = $1) AND status IN ('REQUESTED','ACTIVE') FOR UPDATE`, [userId])
  await db.query(
    `UPDATE conversations SET status = 'CLOSED', closed_by = NULL, closed_reason = 'ACCOUNT_CLOSED'
      WHERE (initiator_id = $1 OR recipient_id = $1) AND status IN ('REQUESTED','ACTIVE')`, [userId])
  for (const c of rows) {
    // an unanswered request is always refunded; an active chat only when the removed account was the danger
    if (c.initiator_id !== userId && !c.refunded && (refundVictims || c.status === 'REQUESTED')) {
      await creditRefund(db, c.initiator_id, c.price_paise, 'REFUND_CLOSED_BY_SYSTEM', c.id,
        'The other member broke our rules and was removed.')
    }
  }
  // fees the banned account itself paid are forfeited
}

export async function creditRefund(
  db: pg.PoolClient, userId: number, paise: number,
  reason: 'REFUND_NO_REPLY' | 'REFUND_DECLINED' | 'REFUND_CLOSED_BY_SYSTEM', conversationId: number, note: string,
) {
  await db.query('UPDATE conversations SET refunded = true WHERE id = $1', [conversationId])
  await db.query('UPDATE users SET credit_paise = credit_paise + $2 WHERE id = $1', [userId, paise])
  await db.query(
    'INSERT INTO credit_ledger (user_id, delta_paise, reason, conversation_id, note) VALUES ($1,$2,$3,$4,$5)',
    [userId, paise, reason, conversationId, note])
}
