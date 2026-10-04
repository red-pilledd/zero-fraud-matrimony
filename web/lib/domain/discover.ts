import 'server-only'
import { q, q0 } from '../server/db.ts'
import { DomainError } from '../pg.ts'
import { ageFrom, type User } from '../types.ts'
import type { Conversation } from './conversations.ts'

// Discovery never crosses pools. A parent browsing the marriage section can only ever see marriage-pool
// members; long-term and casual members exist in separate rooms that the marriage section has no door to.

export type Card = {
  id: number; display_name: string; age: number | null; district: string | null; occupation: string | null
  education: string | null; religion: string | null; marital_status: string | null; height_cm: number | null
  about: string | null; photo_id: number | null; photo_blurred: boolean; created_by: string
}

export type Filters = { ageMin?: number; ageMax?: number; religion?: string; district?: string; marital?: string; page?: number }

const VISIBLE = `u.status = 'ACTIVE' AND u.onboarding_step = 'DONE' AND u.selfie_status = 'VERIFIED'`

function genderSql(me: User, alias = 'u'): string {
  if (me.pool === 'MARRIAGE') return `${alias}.gender <> '${me.gender === 'MAN' ? 'MAN' : 'WOMAN'}'`
  const want = me.seeking === 'MEN' ? `${alias}.gender = 'MAN'` : me.seeking === 'WOMEN' ? `${alias}.gender = 'WOMAN'` : 'true'
  const theyWant = me.gender === 'MAN' ? `${alias}.seeking IN ('MEN','EVERYONE')` : `${alias}.seeking IN ('WOMEN','EVERYONE')`
  return `(${want}) AND (${theyWant})`
}

export async function discover(me: User, f: Filters): Promise<Card[]> {
  const params: unknown[] = [me.id, me.pool]
  const where = [VISIBLE, 'u.pool = $2', 'u.id <> $1', genderSql(me),
    `NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $1))`,
    `NOT EXISTS (SELECT 1 FROM conversations c WHERE LEAST(c.initiator_id, c.recipient_id) = LEAST($1::bigint, u.id) AND GREATEST(c.initiator_id, c.recipient_id) = GREATEST($1::bigint, u.id))`]
  if (f.ageMin) { params.push(f.ageMin); where.push(`u.dob <= (current_date - make_interval(years => $${params.length}))`) }
  if (f.ageMax) { params.push(f.ageMax + 1); where.push(`u.dob > (current_date - make_interval(years => $${params.length}))`) }
  if (f.religion) { params.push(f.religion); where.push(`u.religion = $${params.length}`) }
  if (f.district) { params.push(f.district); where.push(`u.district = $${params.length}`) }
  if (f.marital) { params.push(f.marital); where.push(`u.marital_status = $${params.length}`) }
  params.push(((f.page ?? 0) | 0) * 20)
  const rows = await q<User & { photo_id: number | null }>(
    `SELECT u.*, (SELECT p.id FROM photos p WHERE p.user_id = u.id AND p.status = 'APPROVED' ORDER BY p.is_primary DESC, p.id LIMIT 1) AS photo_id
       FROM users u WHERE ${where.join(' AND ')}
      ORDER BY u.trust_score + CASE WHEN u.last_active_at > now() - interval '3 days' THEN 15 ELSE 0 END DESC, u.last_active_at DESC
      LIMIT 20 OFFSET $${params.length}`, params)
  return rows.map((u) => toCard(me, u, u.photo_id, false))
}

function toCard(me: User, u: User, photoId: number | null, connected: boolean): Card {
  return {
    id: u.id, display_name: u.display_name ?? 'Member', age: ageFrom(u.dob), district: u.district, occupation: u.occupation,
    education: u.education, religion: me.pool === 'MARRIAGE' ? u.religion : null, marital_status: u.marital_status,
    height_cm: u.height_cm, about: u.about, photo_id: photoId, photo_blurred: u.photo_visibility === 'ACCEPTED' && !connected,
    created_by: u.created_by,
  }
}

export type ProfileView = Card & {
  caste: string | null; mother_tongue: string | null; diet: string | null; drinks: string | null; smokes: string | null
  income_band: string | null; photos: Array<{ id: number }>; conversation: Pick<Conversation, 'id' | 'status' | 'initiator_id'> | null
}

/** A full profile, if the viewer may see it: same pool and visible, or already in a conversation with them. */
export async function viewProfile(me: User, id: number): Promise<ProfileView> {
  const u = await q0<User>('SELECT * FROM users WHERE id = $1', [id])
  if (!u) throw new DomainError('Profile not found')
  const conv = await q0<Conversation>(
    `SELECT * FROM conversations WHERE LEAST(initiator_id, recipient_id) = LEAST($1::bigint,$2::bigint)
        AND GREATEST(initiator_id, recipient_id) = GREATEST($1::bigint,$2::bigint)`, [me.id, id])
  const blocked = await q0('SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)', [me.id, id])
  if (blocked) throw new DomainError('Profile not found')
  if (!conv && id !== me.id) {
    const visible = await q0(`SELECT 1 FROM users u WHERE u.id = $2 AND u.id <> $1 AND u.pool = $3 AND ${VISIBLE} AND ${genderSql(me)}`, [me.id, id, me.pool])
    if (!visible) throw new DomainError('Profile not found')
  }
  const photos = await q<{ id: number }>(`SELECT id FROM photos WHERE user_id = $1 AND status = 'APPROVED' ORDER BY is_primary DESC, id`, [id])
  const connected = conv?.status === 'ACTIVE'
  return {
    ...toCard(me, u, photos[0]?.id ?? null, connected),
    caste: me.pool === 'MARRIAGE' ? u.caste : null, mother_tongue: u.mother_tongue, diet: u.diet, drinks: u.drinks, smokes: u.smokes,
    income_band: me.pool === 'MARRIAGE' ? u.income_band : null, photos,
    conversation: conv ? { id: conv.id, status: conv.status, initiator_id: conv.initiator_id } : null,
  }
}

/** May this viewer see this photo, and should it be blurred? */
export async function photoAccess(viewer: User | null, isAdmin: boolean, photoId: number): Promise<{ key: string; blurred: boolean } | null> {
  const p = await q0<{ user_id: number; file_key: string; blur_key: string; status: string }>('SELECT user_id, file_key, blur_key, status FROM photos WHERE id = $1', [photoId])
  if (!p) return null
  if (isAdmin || viewer?.id === p.user_id) return { key: p.file_key, blurred: false }
  if (!viewer || p.status !== 'APPROVED' || viewer.status === 'BANNED') return null
  const owner = await q0<User>('SELECT * FROM users WHERE id = $1', [p.user_id])
  if (!owner || owner.pool !== viewer.pool) return null
  const conv = await q0<{ status: string }>(
    `SELECT status FROM conversations WHERE LEAST(initiator_id, recipient_id) = LEAST($1::bigint,$2::bigint)
        AND GREATEST(initiator_id, recipient_id) = GREATEST($1::bigint,$2::bigint)`, [viewer.id, owner.id])
  if (!conv && (owner.status !== 'ACTIVE' || owner.onboarding_step !== 'DONE')) return null
  const blurred = owner.photo_visibility === 'ACCEPTED' && conv?.status !== 'ACTIVE'
  return { key: blurred ? p.blur_key : p.file_key, blurred }
}
