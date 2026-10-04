import { requireUser } from '@/lib/server/auth.ts'
import Discover from './Discover.tsx'

export const metadata = { title: 'Matches' }

export default async function Page() {
  const u = await requireUser()
  return <Discover pool={u.pool!} selfie={u.selfie_status} defaults={{ ageMin: u.pref_age_min, ageMax: u.pref_age_max }} />
}
