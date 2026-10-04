import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/server/auth.ts'
import { LangProvider } from '@/lib/client/ui.tsx'
import Onboarding from './Onboarding.tsx'

export const metadata = { title: 'Create your profile' }

export default async function Page() {
  const u = await requireUser({ onboarded: false })
  if (u.onboarding_step === 'DONE') redirect('/discover')
  return (
    <LangProvider lang={u.lang}>
      <Onboarding
        initialStep={u.onboarding_step}
        user={{
          created_by: u.created_by, pool: u.pool, lang: u.lang, full_name: u.full_name, display_name: u.display_name, gender: u.gender,
          seeking: u.seeking, dob: u.dob, height_cm: u.height_cm, marital_status: u.marital_status, religion: u.religion, caste: u.caste,
          mother_tongue: u.mother_tongue, district: u.district, state: u.state, country: u.country, education: u.education,
          occupation: u.occupation, income_band: u.income_band, diet: u.diet, drinks: u.drinks, smokes: u.smokes,
          pref_age_min: u.pref_age_min, pref_age_max: u.pref_age_max, photo_visibility: u.photo_visibility, selfie_status: u.selfie_status,
        }}
      />
    </LangProvider>
  )
}
