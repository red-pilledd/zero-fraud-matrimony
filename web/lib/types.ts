export type Pool = 'MARRIAGE' | 'LONG_TERM' | 'CASUAL'
export type Gender = 'MAN' | 'WOMAN'

export type User = {
  id: number
  phone: string
  session_version: number
  created_by: 'SELF' | 'PARENT' | 'SIBLING' | 'RELATIVE' | 'FRIEND'
  track: 'MATRIMONY' | 'DATING' | null
  dating_purpose: Pool | null
  pool: Pool | null
  full_name: string | null
  display_name: string | null
  gender: Gender | null
  seeking: 'MEN' | 'WOMEN' | 'EVERYONE' | null
  dob: string | null
  height_cm: number | null
  marital_status: string | null
  religion: string | null
  caste: string | null
  mother_tongue: string | null
  district: string | null
  state: string | null
  country: string
  education: string | null
  occupation: string | null
  income_band: string | null
  diet: string | null
  drinks: string | null
  smokes: string | null
  about: string | null
  pref_age_min: number | null
  pref_age_max: number | null
  pref_religions: string[] | null
  photo_visibility: 'MEMBERS' | 'ACCEPTED'
  onboarding_step: 'INTENT' | 'BASICS' | 'INTERVIEW' | 'PHOTOS' | 'SELFIE' | 'DONE'
  status: 'ACTIVE' | 'FROZEN' | 'BANNED' | 'DELETED'
  frozen_until: string | null
  ban_reason: string | null
  strikes: number
  selfie_status: 'NONE' | 'PENDING' | 'REVIEW' | 'VERIFIED' | 'REJECTED'
  credit_paise: number
  trust_score: number
  character: Record<string, unknown> | null
  character_at_msgs: number
  character_updated_at: string | null
  msgs_delivered: number
  lang: 'en' | 'ml'
  created_at: string
  last_active_at: string
}

export function ageFrom(dob: string | null): number | null {
  if (!dob) return null
  const [y, m, d] = dob.split('-').map(Number)
  const now = new Date()
  let a = now.getFullYear() - y
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a--
  return a
}
