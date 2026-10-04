import { isAdmin } from '@/lib/server/auth.ts'
import { q0 } from '@/lib/server/db.ts'
import { get } from '@/lib/server/storage.ts'

// Latest selfie of a member — admin only (id = user id).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response('Not found', { status: 404 })
  const r = await q0<{ file_key: string }>(
    `SELECT file_key FROM selfie_checks WHERE user_id = $1 AND file_key IS NOT NULL ORDER BY id DESC LIMIT 1`, [Number((await ctx.params).id)])
  if (!r) return new Response('Not found', { status: 404 })
  return new Response(new Uint8Array(await get(r.file_key)), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store' } })
}
