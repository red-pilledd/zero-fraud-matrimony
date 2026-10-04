'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useT, useLive } from '@/lib/client/ui.tsx'

const ICONS = {
  discover: <path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10z" />,
  inbox: <path d="M4 5h16v11H8l-4 4V5z" />,
  assistant: <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9L18 15z" />,
  me: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0" />,
}

export default function BottomNav({ inbox, questions }: { inbox: number; questions: number }) {
  const t = useT()
  const path = usePathname()
  const router = useRouter()
  // badges come from the server layout; refresh them when something happens
  useLive((e) => { if (e.type !== 'hello') router.refresh() })
  const items = [
    { href: '/discover', key: 'discover' as const, label: t('nav.discover'), badge: 0 },
    { href: '/inbox', key: 'inbox' as const, label: t('nav.inbox'), badge: inbox },
    { href: '/assistant', key: 'assistant' as const, label: t('nav.assistant'), badge: questions },
    { href: '/me', key: 'me' as const, label: t('nav.me'), badge: 0 },
  ]
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-line safe-bottom z-40">
      <div className="max-w-lg mx-auto grid grid-cols-4">
        {items.map((it) => {
          const on = path.startsWith(it.href) || (it.key === 'inbox' && path.startsWith('/chat'))
          return (
            <Link key={it.href} href={it.href} className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${on ? 'text-maroon' : 'text-muted'}`}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={on ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round">{ICONS[it.key]}</svg>
              {it.label}
              {it.badge > 0 && <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 h-4 px-1 rounded-full bg-gold text-white text-[10px] grid place-items-center">{it.badge}</span>}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
