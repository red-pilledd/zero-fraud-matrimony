import { getUser, isAdmin } from '@/lib/server/auth.ts'
import { photoAccess } from '@/lib/domain/discover.ts'
import { get } from '@/lib/server/storage.ts'

type Ctx = { params: Promise<{ id: string }> }

// Photos are never public files: every request is checked against who is asking.
export async function GET(_req: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id)
  if (!Number.isInteger(id)) return new Response('Not found', { status: 404 })
  const access = await photoAccess(await getUser(), await isAdmin(), id)
  if (!access) return new Response('Not found', { status: 404 })
  try {
    const data = await get(access.key)
    return new Response(new Uint8Array(data), {
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=300', 'x-blurred': String(access.blurred) },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
