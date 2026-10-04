import { z } from 'zod'
import { handle, ok } from '@/lib/server/http.ts'
import { apiUser } from '@/lib/server/auth.ts'
import { deletePhoto, listPhotos, makePrimary } from '@/lib/domain/onboarding.ts'

type Ctx = { params: Promise<{ id: string }> }

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const u = await apiUser()
  await deletePhoto(u, Number((await ctx.params).id))
  return ok({ photos: await listPhotos(u.id) })
})

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const u = await apiUser()
  z.object({ action: z.literal('primary') }).parse(await req.json())
  await makePrimary(u, Number((await ctx.params).id))
  return ok({ photos: await listPhotos(u.id) })
})
