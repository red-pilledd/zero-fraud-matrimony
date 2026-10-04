import { handle, ok } from '@/lib/server/http.ts'
import { apiUser } from '@/lib/server/auth.ts'
import { addPhoto, listPhotos } from '@/lib/domain/onboarding.ts'
import { DomainError } from '@/lib/pg.ts'

export const GET = handle(async () => {
  const u = await apiUser()
  return ok({ photos: await listPhotos(u.id) })
})

export const POST = handle(async (req: Request) => {
  const u = await apiUser({ canAct: true })
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) throw new DomainError('Choose a photo')
  const photo = await addPhoto(u, file)
  return ok({ photo, photos: await listPhotos(u.id) })
})
