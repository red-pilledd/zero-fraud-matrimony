import { handle, ok } from '@/lib/server/http.ts'
import { apiAdmin } from '@/lib/server/auth.ts'
import { runAdminAction } from '@/lib/domain/admin.ts'
import { getSettings, saveSettings, SettingsSchema } from '@/lib/server/settings.ts'

export const POST = handle(async (req: Request) => {
  await apiAdmin()
  const body = await req.json()
  if (body?.action === 'settings') {
    const current = await getSettings()
    await saveSettings(SettingsSchema.parse({ ...current, ...body.settings }))
    return ok({ message: 'Settings saved' })
  }
  return ok({ message: await runAdminAction(body) })
})
