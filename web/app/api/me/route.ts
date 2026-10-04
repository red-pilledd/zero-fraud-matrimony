import { z } from 'zod'
import { handle, ok } from '@/lib/server/http.ts'
import { apiUser, endSession } from '@/lib/server/auth.ts'
import { q, tx } from '@/lib/server/db.ts'
import { changePurpose, saveBasics, finishInterview } from '@/lib/domain/onboarding.ts'
import { screenRules } from '@/lib/moderation/rules.ts'
import { DomainError } from '@/lib/pg.ts'
import { remove } from '@/lib/server/storage.ts'
import { creditRefund } from '@/lib/domain/moderation.ts'

const Patch = z.object({
  lang: z.enum(['en', 'ml']).optional(),
  photo_visibility: z.enum(['MEMBERS', 'ACCEPTED']).optional(),
  basics: z.record(z.string(), z.unknown()).optional(),
  about: z.string().optional(),
  purpose: z.object({ track: z.enum(['MATRIMONY', 'DATING']), purpose: z.enum(['MARRIAGE', 'LONG_TERM', 'CASUAL']).optional() }).optional(),
})

export const PATCH = handle(async (req: Request) => {
  const u = await apiUser()
  const p = Patch.parse(await req.json())
  if (p.lang) await q('UPDATE users SET lang = $2 WHERE id = $1', [u.id, p.lang])
  if (p.photo_visibility) await q('UPDATE users SET photo_visibility = $2 WHERE id = $1', [u.id, p.photo_visibility])
  if (p.basics) await saveBasics(u, p.basics)
  if (p.about !== undefined) {
    if (screenRules(p.about, { senderRecent: [], contactApproved: false }).block) throw new DomainError("The About section can't contain contact details.")
    await finishInterview(u, p.about)
  }
  if (p.purpose) await changePurpose(u, p.purpose)
  return ok()
})

/** Delete my account: profile hidden, conversations closed, photos erased. The phone stays reserved so a ban can't be dodged. */
export const DELETE = handle(async () => {
  const u = await apiUser()
  const files = await q<{ file_key: string; blur_key: string }>('SELECT file_key, blur_key FROM photos WHERE user_id = $1', [u.id])
  await tx(async (db) => {
    // people waiting on a reply from me get their fee back
    const { rows } = await db.query<{ id: number; initiator_id: number; price_paise: number }>(
      `SELECT id, initiator_id, price_paise FROM conversations WHERE recipient_id = $1 AND status = 'REQUESTED' AND NOT refunded`, [u.id])
    for (const c of rows) await creditRefund(db, c.initiator_id, c.price_paise, 'REFUND_CLOSED_BY_SYSTEM', c.id, 'The member left the platform.')
    await db.query(`UPDATE conversations SET status = 'CLOSED', closed_by = $1, closed_reason = 'ACCOUNT_DELETED'
                     WHERE (initiator_id = $1 OR recipient_id = $1) AND status IN ('REQUESTED','ACTIVE')`, [u.id])
    await db.query('DELETE FROM photos WHERE user_id = $1', [u.id])
    await db.query('DELETE FROM push_subscriptions WHERE user_id = $1', [u.id])
    await db.query(`UPDATE users SET status = CASE WHEN status = 'BANNED' THEN 'BANNED' ELSE 'DELETED' END, about = NULL, character = NULL,
                     selfie_status = 'NONE', session_version = session_version + 1 WHERE id = $1`, [u.id])
  })
  for (const f of files) { await remove(f.file_key); await remove(f.blur_key) }
  await endSession()
  return ok()
})
