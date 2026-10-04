import 'server-only'
import { z } from 'zod'
import { q, q0, tx } from '../server/db.ts'
import { DomainError } from '../pg.ts'
import { put, get, newKey, processPhoto, remove } from '../server/storage.ts'
import { checkPhoto, checkSelfie, CHALLENGES } from '../ai/vision.ts'
import { AiUnavailable } from '../ai/llm.ts'
import { ageFrom, type Pool, type User } from '../types.ts'

// ---------- step 1: who is creating the profile, and what are they looking for ----------
// Only the member themselves ever sees the non-marriage options. A parent creating a profile goes
// straight to marriage and never learns other sections exist.

export const IntentInput = z.object({
  createdBy: z.enum(['SELF', 'PARENT', 'SIBLING', 'RELATIVE', 'FRIEND']),
  track: z.enum(['MATRIMONY', 'DATING']).optional(),
  purpose: z.enum(['MARRIAGE', 'LONG_TERM', 'CASUAL']).optional(),
  lang: z.enum(['en', 'ml']),
})

export function routeIntent(i: z.infer<typeof IntentInput>): { track: 'MATRIMONY' | 'DATING'; purpose: Pool | null; pool: Pool } {
  if (i.createdBy !== 'SELF' || i.track !== 'DATING') return { track: 'MATRIMONY', purpose: null, pool: 'MARRIAGE' }
  if (!i.purpose) throw new DomainError('Choose what you are looking for')
  return { track: 'DATING', purpose: i.purpose, pool: i.purpose }
}

export async function setIntent(u: User, input: unknown) {
  if (u.onboarding_step !== 'INTENT' && u.onboarding_step !== 'BASICS') throw new DomainError('Already set')
  const i = IntentInput.parse(input)
  const r = routeIntent(i)
  await q(`UPDATE users SET created_by = $2, track = $3, dating_purpose = $4, pool = $5, lang = $6, onboarding_step = 'BASICS' WHERE id = $1`,
    [u.id, i.createdBy, r.track, r.purpose, r.pool, i.lang])
}

/** Later change of purpose — only for self-managed profiles. Conversations already open stay open. */
export async function changePurpose(u: User, input: unknown) {
  if (u.created_by !== 'SELF') throw new DomainError('Not available for this profile')
  const i = IntentInput.parse({ ...(input as object), createdBy: 'SELF', lang: u.lang })
  const r = routeIntent(i)
  if (r.pool === 'MARRIAGE') await checkMarriageAge(u.gender!, u.dob!)
  await q(`UPDATE users SET track = $2, dating_purpose = $3, pool = $4, seeking = CASE WHEN $4 = 'MARRIAGE' THEN NULL ELSE COALESCE(seeking, CASE WHEN gender = 'MAN' THEN 'WOMEN' ELSE 'MEN' END) END WHERE id = $1`,
    [u.id, r.track, r.purpose, r.pool])
  await q(`UPDATE moderation_events SET resolved_at = now(), resolution = 'Member changed purpose' WHERE user_id = $1 AND kind = 'INTENT_MISMATCH' AND resolved_at IS NULL`, [u.id])
}

// ---------- step 2: the details ----------

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null))

export const BasicsInput = z.object({
  full_name: z.string().trim().min(2, 'Enter the full name').max(80),
  display_name: z.string().trim().min(2, 'Enter the name to show').max(30),
  gender: z.enum(['MAN', 'WOMAN']),
  seeking: z.enum(['MEN', 'WOMEN', 'EVERYONE']).optional(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date of birth'),
  height_cm: z.coerce.number().int().min(120).max(230).optional(),
  marital_status: z.enum(['NEVER_MARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED']),
  religion: opt(40), caste: opt(60), mother_tongue: opt(40),
  district: z.string().trim().min(2, 'Enter the district / city').max(60),
  state: opt(40), country: z.string().trim().max(40).default('India'),
  education: opt(80), occupation: opt(80), income_band: opt(40),
  diet: opt(30), drinks: opt(30), smokes: opt(30),
  pref_age_min: z.coerce.number().int().min(18).max(80).optional(),
  pref_age_max: z.coerce.number().int().min(18).max(90).optional(),
  photo_visibility: z.enum(['MEMBERS', 'ACCEPTED']).default('MEMBERS'),
})

async function checkMarriageAge(gender: 'MAN' | 'WOMAN', dob: string) {
  const age = ageFrom(dob) ?? 0
  const min = gender === 'MAN' ? 21 : 18
  if (age < min) throw new DomainError(`For marriage the legal minimum age is ${min} for ${gender === 'MAN' ? 'men' : 'women'}.`)
}

export async function saveBasics(u: User, input: unknown) {
  if (!u.pool) throw new DomainError('Choose what you are looking for first')
  const b = BasicsInput.parse(input)
  const age = ageFrom(b.dob)
  if (age === null || age > 90) throw new DomainError('Check the date of birth')
  if (age < 18) throw new DomainError('You must be 18 or older to join.')
  if (u.pool === 'MARRIAGE') await checkMarriageAge(b.gender, b.dob)
  const seeking = u.pool === 'MARRIAGE' ? null : (b.seeking ?? (b.gender === 'MAN' ? 'WOMEN' : 'MEN'))
  if (b.pref_age_min && b.pref_age_max && b.pref_age_min > b.pref_age_max) throw new DomainError('Preferred age: minimum is above maximum')
  await q(
    `UPDATE users SET full_name=$2, display_name=$3, gender=$4, seeking=$5, dob=$6, height_cm=$7, marital_status=$8,
       religion=$9, caste=$10, mother_tongue=$11, district=$12, state=$13, country=$14, education=$15, occupation=$16,
       income_band=$17, diet=$18, drinks=$19, smokes=$20, pref_age_min=$21, pref_age_max=$22, photo_visibility=$23,
       onboarding_step = CASE WHEN onboarding_step IN ('INTENT','BASICS') THEN 'INTERVIEW' ELSE onboarding_step END
     WHERE id = $1`,
    [u.id, b.full_name, b.display_name, b.gender, seeking, b.dob, b.height_cm ?? null, b.marital_status, b.religion, b.caste,
      b.mother_tongue, b.district, b.state, b.country, b.education, b.occupation, b.income_band, b.diet, b.drinks, b.smokes,
      b.pref_age_min ?? null, b.pref_age_max ?? null, b.photo_visibility])
}

export async function finishInterview(u: User, about: string) {
  const text = about.trim()
  if (text.length < 40) throw new DomainError('The About section is too short')
  if (text.length > 2000) throw new DomainError('The About section is too long')
  await q(`UPDATE users SET about = $2, onboarding_step = CASE WHEN onboarding_step = 'INTERVIEW' THEN 'PHOTOS' ELSE onboarding_step END WHERE id = $1`, [u.id, text])
}

// ---------- step 3: photos ----------

export type PhotoRow = { id: number; is_primary: boolean; status: string; reason: string | null }

export async function listPhotos(userId: number) {
  return q<PhotoRow>('SELECT id, is_primary, status, reason FROM photos WHERE user_id = $1 ORDER BY is_primary DESC, id', [userId])
}

export async function addPhoto(u: User, file: File): Promise<PhotoRow> {
  if (file.size > 10 * 1024 * 1024) throw new DomainError('Photo is too large (10 MB max)')
  const count = await q0<{ n: string }>(`SELECT COUNT(*) AS n FROM photos WHERE user_id = $1 AND status <> 'REJECTED'`, [u.id])
  if (Number(count?.n) >= 6) throw new DomainError('You can have up to 6 photos. Remove one first.')
  const today = await q0<{ n: string }>(`SELECT COUNT(*) AS n FROM photos WHERE user_id = $1 AND created_at > now() - interval '1 day'`, [u.id])
  if (Number(today?.n) >= 20) throw new DomainError('Too many uploads today. Try again tomorrow.')
  let processed
  try {
    processed = await processPhoto(Buffer.from(await file.arrayBuffer()))
  } catch {
    throw new DomainError('That file is not a usable photo (JPG/PNG, at least 200×200).')
  }
  const hasPrimary = await q0(`SELECT 1 FROM photos WHERE user_id = $1 AND is_primary AND status IN ('APPROVED','REVIEW','PENDING')`, [u.id])
  const isPrimary = !hasPrimary
  let verdict
  try {
    verdict = await checkPhoto({ mediaType: 'image/jpeg', base64: processed.full.toString('base64') }, isPrimary, u.id, u.lang)
  } catch (err) {
    if (err instanceof AiUnavailable) throw new DomainError('Our photo check is busy. Please try again in a minute.')
    throw err
  }
  const status = verdict.decision === 'APPROVE' ? 'APPROVED' : verdict.decision === 'REJECT' ? 'REJECTED' : 'REVIEW'
  if (status === 'REJECTED') {
    // rejected photos are not kept
    return { id: 0, is_primary: false, status, reason: verdict.user_note || 'Please upload a clear photo of your face.' }
  }
  const fileKey = newKey('photos', u.id), blurKey = fileKey.replace('.jpg', '.blur.jpg')
  await put(fileKey, processed.full)
  await put(blurKey, processed.blur)
  const [row] = await q<PhotoRow>(
    `INSERT INTO photos (user_id, file_key, blur_key, is_primary, status, ai_result, reason) VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, is_primary, status, reason`,
    [u.id, fileKey, blurKey, isPrimary, status, JSON.stringify(verdict), status === 'REVIEW' ? (verdict.user_note || 'Being checked by our team') : null])
  if (status === 'REVIEW') {
    await q(`INSERT INTO moderation_events (user_id, kind, detail, needs_review) VALUES ($1,'PHOTO_REVIEW',$2,true)`,
      [u.id, `Photo ${row.id}: ${verdict.internal}`])
  }
  return row
}

export async function deletePhoto(u: User, photoId: number) {
  const p = await q0<{ file_key: string; blur_key: string; is_primary: boolean }>('SELECT file_key, blur_key, is_primary FROM photos WHERE id = $1 AND user_id = $2', [photoId, u.id])
  if (!p) throw new DomainError('Photo not found')
  await tx(async (db) => {
    await db.query('DELETE FROM photos WHERE id = $1', [photoId])
    if (p.is_primary) {
      await db.query(`UPDATE photos SET is_primary = true WHERE id = (SELECT id FROM photos WHERE user_id = $1 AND status = 'APPROVED' ORDER BY id LIMIT 1)`, [u.id])
    }
  })
  await remove(p.file_key)
  await remove(p.blur_key)
}

export async function makePrimary(u: User, photoId: number) {
  const p = await q0(`SELECT 1 FROM photos WHERE id = $1 AND user_id = $2 AND status = 'APPROVED'`, [photoId, u.id])
  if (!p) throw new DomainError('Only an approved photo can be the main photo')
  await q('UPDATE photos SET is_primary = (id = $2) WHERE user_id = $1', [u.id, photoId])
}

export async function finishPhotos(u: User) {
  const ok = await q0(`SELECT 1 FROM photos WHERE user_id = $1 AND status = 'APPROVED'`, [u.id])
  if (!ok) throw new DomainError('Add at least one approved photo of your face')
  await q(`UPDATE photos SET is_primary = (id = (SELECT id FROM photos WHERE user_id = $1 AND status = 'APPROVED' ORDER BY is_primary DESC, id LIMIT 1)) WHERE user_id = $1`, [u.id])
  await q(`UPDATE users SET onboarding_step = 'SELFIE' WHERE id = $1 AND onboarding_step = 'PHOTOS'`, [u.id])
}

// ---------- step 4: live selfie with a random gesture ----------

export async function issueChallenge(u: User): Promise<{ id: number; challenge: string }> {
  const tries = await q0<{ n: string }>(`SELECT COUNT(*) AS n FROM selfie_checks WHERE user_id = $1 AND created_at > now() - interval '1 day' AND file_key IS NOT NULL`, [u.id])
  if (Number(tries?.n) >= 6) throw new DomainError('Too many selfie attempts today. Try again tomorrow.')
  await q(`UPDATE selfie_checks SET status = 'EXPIRED' WHERE user_id = $1 AND status = 'ISSUED'`, [u.id])
  const challenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)]
  const [r] = await q<{ id: number }>(`INSERT INTO selfie_checks (user_id, challenge) VALUES ($1,$2) RETURNING id`, [u.id, challenge])
  return { id: r.id, challenge }
}

export async function submitSelfie(u: User, checkId: number, dataUrl: string): Promise<{ status: string; note: string }> {
  const chk = await q0<{ id: number; challenge: string; status: string; created_at: string }>(
    `SELECT id, challenge, status, created_at FROM selfie_checks WHERE id = $1 AND user_id = $2`, [checkId, u.id])
  if (!chk || chk.status !== 'ISSUED') throw new DomainError('This check has expired. Start again.')
  if (Date.now() - new Date(chk.created_at).getTime() > 5 * 60_000) throw new DomainError('Too slow — the gesture changes every 5 minutes. Start again.')
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl)
  if (!m) throw new DomainError('Camera image missing')
  let img
  try {
    img = await processPhoto(Buffer.from(m[2], 'base64'))
  } catch {
    throw new DomainError('The camera image was not clear enough. Try again in better light.')
  }
  const key = newKey('selfies', u.id)
  await put(key, img.full)
  const refs = await q<{ file_key: string }>(`SELECT file_key FROM photos WHERE user_id = $1 AND status = 'APPROVED' ORDER BY is_primary DESC, id LIMIT 2`, [u.id])
  const refImgs = await Promise.all(refs.map(async (r) => ({ mediaType: 'image/jpeg' as const, base64: (await get(r.file_key)).toString('base64') })))
  let v
  try {
    v = await checkSelfie({ mediaType: 'image/jpeg', base64: img.full.toString('base64') }, chk.challenge, refImgs, u.id, u.lang)
  } catch (err) {
    if (err instanceof AiUnavailable) throw new DomainError('Our check is busy. Please try again in a minute.')
    throw err
  }
  const passed = v.gesture_done && v.live_capture && v.single_person
  const status = passed && v.same_person === 'HIGH' ? 'VERIFIED'
    : passed && v.same_person === 'MEDIUM' ? 'REVIEW'
    : 'REJECTED'
  await tx(async (db) => {
    await db.query(`UPDATE selfie_checks SET file_key = $2, status = $3, ai_result = $4, decided_at = now() WHERE id = $1`,
      [chk.id, key, status, JSON.stringify(v)])
    await db.query(`UPDATE users SET selfie_status = $2,
        onboarding_step = CASE WHEN onboarding_step = 'SELFIE' AND $2 IN ('VERIFIED','REVIEW') THEN 'DONE' ELSE onboarding_step END
      WHERE id = $1`, [u.id, status])
    if (status === 'REVIEW') {
      await db.query(`INSERT INTO moderation_events (user_id, kind, detail, needs_review) VALUES ($1,'SELFIE_REVIEW',$2,true)`,
        [u.id, `Selfie check ${chk.id}: ${v.internal}`])
    }
  })
  const note = status === 'VERIFIED' ? 'Verified — welcome!'
    : status === 'REVIEW' ? 'Thanks! Our team will confirm your selfie shortly. You can look around meanwhile.'
    : v.user_note || "We couldn't confirm it — please try again, doing the gesture clearly in good light."
  return { status, note }
}
