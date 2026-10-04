import { requireUser } from '@/lib/server/auth.ts'
import { q } from '@/lib/server/db.ts'
import Me from './Me.tsx'

export const metadata = { title: 'Profile' }

export default async function Page() {
  const u = await requireUser()
  const ledger = await q<{ delta_paise: number; reason: string; note: string | null; created_at: string }>(
    'SELECT delta_paise, reason, note, created_at FROM credit_ledger WHERE user_id = $1 ORDER BY id DESC LIMIT 20', [u.id])
  return (
    <Me
      user={{
        id: u.id, phone: u.phone, created_by: u.created_by, track: u.track, dating_purpose: u.dating_purpose, pool: u.pool, lang: u.lang,
        full_name: u.full_name, display_name: u.display_name, gender: u.gender, seeking: u.seeking, dob: u.dob, height_cm: u.height_cm,
        marital_status: u.marital_status, religion: u.religion, caste: u.caste, mother_tongue: u.mother_tongue, district: u.district,
        state: u.state, country: u.country, education: u.education, occupation: u.occupation, income_band: u.income_band, diet: u.diet,
        drinks: u.drinks, smokes: u.smokes, pref_age_min: u.pref_age_min, pref_age_max: u.pref_age_max, photo_visibility: u.photo_visibility,
        about: u.about, credit_paise: u.credit_paise, selfie_status: u.selfie_status, strikes: u.strikes,
      }}
      ledger={ledger}
      vapid={process.env.VAPID_PUBLIC_KEY ?? null}
    />
  )
}
