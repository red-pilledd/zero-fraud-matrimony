import { q0 } from '@/lib/server/db.ts'
import { getUser } from '@/lib/server/auth.ts'

export default async function Closed() {
  const u = await getUser()
  const r = u ? await q0<{ ban_reason: string | null }>('SELECT ban_reason FROM users WHERE id = $1', [u.id]) : null
  return (
    <main className="min-h-dvh grid place-items-center px-5">
      <div className="card p-6 max-w-sm text-center">
        <h1 className="text-lg font-semibold">Account closed</h1>
        <p className="text-sm text-muted mt-2">This account was closed for breaking the community rules.</p>
        {r?.ban_reason && <p className="text-sm mt-3">{r.ban_reason}</p>}
        <p className="text-xs text-muted mt-4">If you think this is a mistake, write to support with your registered mobile number.</p>
      </div>
    </main>
  )
}
