import { getSettings } from '@/lib/server/settings.ts'
import { SettingsForm } from '../../AdminUI.tsx'

export const dynamic = 'force-dynamic'

export default async function Settings() {
  const s = await getSettings()
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <SettingsForm initial={s} models={Object.keys(s.ai_rates)} />
    </div>
  )
}
