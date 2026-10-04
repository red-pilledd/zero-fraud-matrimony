import Link from 'next/link'
import { requireAdmin } from '@/lib/server/auth.ts'
import { qv } from '@/lib/server/db.ts'
import { AdminLogout } from '../AdminUI.tsx'

export const metadata = { title: 'Admin' }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  const open = Number(await qv(`SELECT COUNT(*) FROM moderation_events WHERE needs_review AND resolved_at IS NULL`))
  return (
    <div className="min-h-dvh">
      <header className="bg-maroon text-white">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center gap-6 flex-wrap">
          <span className="font-serif font-bold text-lg">{process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Thuna'} · Admin</span>
          <nav className="flex gap-4 text-sm">
            <Link href="/admin" className="hover:underline">Dashboard</Link>
            <Link href="/admin/queue" className="hover:underline">Review queue {open > 0 && <span className="ml-1 bg-gold rounded-full px-2 py-0.5 text-xs">{open}</span>}</Link>
            <Link href="/admin/users" className="hover:underline">Members</Link>
            <Link href="/admin/settings" className="hover:underline">Settings</Link>
          </nav>
          <span className="ml-auto"><AdminLogout /></span>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-5 py-6">{children}</main>
      <footer className="text-center text-xs text-muted pb-6">Designed by IndusLabs</footer>
    </div>
  )
}
