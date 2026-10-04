import 'server-only'
import { z } from 'zod'
import { q, q0, tx } from '../server/db.ts'
import { publish } from '../server/bus.ts'
import { DomainError } from '../pg.ts'
import { banUser } from './moderation.ts'
import { refreshCharacter } from './character.ts'

export const AdminAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('resolve'), eventId: z.number().int(), note: z.string().max(300).optional() }),
  z.object({ action: z.literal('ban'), userId: z.number().int(), reason: z.string().min(3).max(300), refund: z.boolean().default(true) }),
  z.object({ action: z.literal('unban'), userId: z.number().int() }),
  z.object({ action: z.literal('unfreeze'), userId: z.number().int() }),
  z.object({ action: z.literal('clear_strikes'), userId: z.number().int() }),
  z.object({ action: z.literal('reroute'), userId: z.number().int(), pool: z.enum(['MARRIAGE', 'LONG_TERM', 'CASUAL']) }),
  z.object({ action: z.literal('selfie'), userId: z.number().int(), approve: z.boolean() }),
  z.object({ action: z.literal('photo'), photoId: z.number().int(), approve: z.boolean() }),
  z.object({ action: z.literal('credit'), userId: z.number().int(), rupees: z.number().int().min(-10000).max(10000), note: z.string().min(3).max(200) }),
  z.object({ action: z.literal('ask'), userId: z.number().int(), question: z.string().min(5).max(240) }),
  z.object({ action: z.literal('rebuild_character'), userId: z.number().int() }),
])

export async function runAdminAction(raw: unknown): Promise<string> {
  const a = AdminAction.parse(raw)
  const resolveOpen = (userId: number, kinds: string[], note: string) =>
    q(`UPDATE moderation_events SET resolved_at = now(), resolution = $3 WHERE user_id = $1 AND kind = ANY($2) AND resolved_at IS NULL`, [userId, kinds, note])

  switch (a.action) {
    case 'resolve':
      await q(`UPDATE moderation_events SET resolved_at = now(), resolution = $2 WHERE id = $1`, [a.eventId, a.note ?? 'Reviewed — no action'])
      return 'Resolved'
    case 'ban':
      await tx(async (db) => {
        await banUser(db, a.userId, a.reason, a.refund)
        await db.query(`INSERT INTO moderation_events (user_id, kind, detail, needs_review, resolved_at, resolution) VALUES ($1,'BAN',$2,false,now(),'Banned by admin')`, [a.userId, a.reason])
      })
      await resolveOpen(a.userId, ['REPORT', 'RISK_FLAG', 'SAFETY', 'INTENT_MISMATCH', 'BAN', 'FREEZE', 'WARNING', 'SELFIE_REVIEW', 'PHOTO_REVIEW'], 'Banned by admin')
      publish(a.userId, { type: 'account' })
      return 'Banned'
    case 'unban':
      await q(`UPDATE users SET status = 'ACTIVE', ban_reason = NULL, strikes = 0, frozen_until = NULL WHERE id = $1 AND status = 'BANNED'`, [a.userId])
      return 'Unbanned (their old conversations stay closed)'
    case 'unfreeze':
      await q(`UPDATE users SET status = 'ACTIVE', frozen_until = NULL WHERE id = $1 AND status = 'FROZEN'`, [a.userId])
      publish(a.userId, { type: 'account' })
      return 'Unfrozen'
    case 'clear_strikes':
      await q(`UPDATE users SET strikes = 0 WHERE id = $1`, [a.userId])
      return 'Strikes cleared'
    case 'reroute': {
      const u = await q0<{ created_by: string; gender: string }>('SELECT created_by, gender FROM users WHERE id = $1', [a.userId])
      if (!u) throw new DomainError('User not found')
      if (a.pool !== 'MARRIAGE' && u.created_by !== 'SELF') throw new DomainError('Family-managed profiles can only be in the marriage section')
      await q(`UPDATE users SET pool = $2, track = CASE WHEN $2 = 'MARRIAGE' AND created_by <> 'SELF' THEN 'MATRIMONY' ELSE COALESCE(track, 'DATING') END,
                 dating_purpose = CASE WHEN track = 'MATRIMONY' AND $2 = 'MARRIAGE' THEN NULL ELSE $2 END,
                 seeking = CASE WHEN $2 = 'MARRIAGE' THEN NULL ELSE COALESCE(seeking, CASE WHEN gender = 'MAN' THEN 'WOMEN' ELSE 'MEN' END) END
               WHERE id = $1`, [a.userId, a.pool])
      await resolveOpen(a.userId, ['INTENT_MISMATCH'], `Rerouted to ${a.pool}`)
      return `Moved to ${a.pool}`
    }
    case 'selfie':
      await tx(async (db) => {
        await db.query(`UPDATE users SET selfie_status = $2, onboarding_step = CASE WHEN onboarding_step = 'SELFIE' AND $2 = 'VERIFIED' THEN 'DONE' ELSE onboarding_step END WHERE id = $1`,
          [a.userId, a.approve ? 'VERIFIED' : 'REJECTED'])
        await db.query(`UPDATE selfie_checks SET status = $2, reviewed_note = 'admin', decided_at = now() WHERE id = (SELECT id FROM selfie_checks WHERE user_id = $1 AND file_key IS NOT NULL ORDER BY id DESC LIMIT 1)`,
          [a.userId, a.approve ? 'VERIFIED' : 'REJECTED'])
      })
      await resolveOpen(a.userId, ['SELFIE_REVIEW'], a.approve ? 'Selfie approved' : 'Selfie rejected')
      publish(a.userId, { type: 'account' })
      return a.approve ? 'Selfie approved' : 'Selfie rejected — member will be asked to retake'
    case 'photo': {
      const p = await q0<{ user_id: number }>('SELECT user_id FROM photos WHERE id = $1', [a.photoId])
      if (!p) throw new DomainError('Photo not found')
      await q(`UPDATE photos SET status = $2, reason = $3 WHERE id = $1`, [a.photoId, a.approve ? 'APPROVED' : 'REJECTED', a.approve ? null : 'Removed by our team'])
      await q(`UPDATE moderation_events SET resolved_at = now(), resolution = $3 WHERE user_id = $1 AND kind = 'PHOTO_REVIEW' AND detail LIKE $2 AND resolved_at IS NULL`,
        [p.user_id, `Photo ${a.photoId}:%`, a.approve ? 'Photo approved' : 'Photo rejected'])
      return a.approve ? 'Photo approved' : 'Photo rejected'
    }
    case 'credit': {
      const paise = a.rupees * 100
      await tx(async (db) => {
        const r = await db.query('UPDATE users SET credit_paise = credit_paise + $2 WHERE id = $1 AND credit_paise + $2 >= 0', [a.userId, paise])
        if (!r.rowCount) throw new DomainError('Credit cannot go below zero')
        await db.query(`INSERT INTO credit_ledger (user_id, delta_paise, reason, note) VALUES ($1,$2,'ADMIN',$3)`, [a.userId, paise, a.note])
      })
      return 'Credit updated'
    }
    case 'ask':
      await q(`INSERT INTO ai_questions (user_id, question, why) VALUES ($1,$2,'Asked by moderator')`, [a.userId, a.question])
      publish(a.userId, { type: 'questions' })
      return 'Question sent to the member’s assistant'
    case 'rebuild_character':
      await refreshCharacter(a.userId)
      return 'Character read rebuilt'
  }
}
