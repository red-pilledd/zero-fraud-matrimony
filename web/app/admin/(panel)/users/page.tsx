import Link from 'next/link'
import { q } from '@/lib/server/db.ts'
import { ageFrom } from '@/lib/types.ts'

export const dynamic = 'force-dynamic'

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string; pool?: string; status?: string }> }) {
  const sp = await searchParams
  const where: string[] = ['true']
  const params: unknown[] = []
  if (sp.q) { params.push(`%${sp.q}%`); where.push(`(phone ILIKE $${params.length} OR display_name ILIKE $${params.length} OR full_name ILIKE $${params.length} OR id::text = $${params.length + 1})`); params.push(sp.q) }
  if (sp.pool) { params.push(sp.pool); where.push(`pool = $${params.length}`) }
  if (sp.status) { params.push(sp.status); where.push(`status = $${params.length}`) }
  const rows = await q<{ id: number; phone: string; display_name: string | null; full_name: string | null; gender: string | null; dob: string | null; pool: string | null; created_by: string; status: string; onboarding_step: string; selfie_status: string; strikes: number; trust_score: number; msgs_delivered: number; created_at: string }>(
    `SELECT id, phone, display_name, full_name, gender, dob, pool, created_by, status, onboarding_step, selfie_status, strikes, trust_score, msgs_delivered, created_at
       FROM users WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 200`, params)
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-2">
        <input className="input !w-64" name="q" defaultValue={sp.q} placeholder="Phone, name or #id" />
        <select className="input !w-40" name="pool" defaultValue={sp.pool ?? ''}><option value="">All sections</option><option>MARRIAGE</option><option>LONG_TERM</option><option>CASUAL</option></select>
        <select className="input !w-40" name="status" defaultValue={sp.status ?? ''}><option value="">Any status</option><option>ACTIVE</option><option>FROZEN</option><option>BANNED</option><option>DELETED</option></select>
        <button className="btn btn-primary">Search</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted"><tr className="[&>th]:p-2"><th>#</th><th>Name</th><th>Phone</th><th>Section</th><th>By</th><th>Status</th><th>Setup</th><th>Selfie</th><th>Strikes</th><th>Trust</th><th>Msgs</th><th>Joined</th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-line [&>td]:p-2">
                <td><Link className="text-maroon font-semibold" href={`/admin/users/${u.id}`}>{u.id}</Link></td>
                <td>{u.display_name ?? '—'} <span className="text-muted">{u.gender === 'MAN' ? 'M' : u.gender === 'WOMAN' ? 'F' : ''}{ageFrom(u.dob) ?? ''}</span></td>
                <td className="text-muted">{u.phone}</td><td>{u.pool ?? '—'}</td><td>{u.created_by}</td>
                <td className={u.status === 'BANNED' ? 'text-red-700' : u.status === 'FROZEN' ? 'text-amber-700' : ''}>{u.status}</td>
                <td>{u.onboarding_step}</td><td>{u.selfie_status}</td><td>{u.strikes}</td><td>{u.trust_score}</td><td>{u.msgs_delivered}</td>
                <td className="text-muted">{new Date(u.created_at).toLocaleDateString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
