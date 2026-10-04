import { handle, ok } from '@/lib/server/http.ts'
import { apiUser } from '@/lib/server/auth.ts'
import { discover } from '@/lib/domain/discover.ts'

export const GET = handle(async (req: Request) => {
  const u = await apiUser({ onboarded: true })
  const sp = new URL(req.url).searchParams
  const num = (k: string) => (sp.get(k) ? Number(sp.get(k)) : undefined)
  const cards = await discover(u, {
    ageMin: num('ageMin'), ageMax: num('ageMax'), religion: sp.get('religion') || undefined,
    district: sp.get('district') || undefined, marital: sp.get('marital') || undefined, page: num('page'),
  })
  return ok({ cards })
})
