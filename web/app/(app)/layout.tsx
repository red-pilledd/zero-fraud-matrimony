import { requireUser } from '@/lib/server/auth.ts'
import { LangProvider, LiveProvider } from '@/lib/client/ui.tsx'
import { q0 } from '@/lib/server/db.ts'
import BottomNav from './BottomNav.tsx'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser()
  const counts = await q0<{ requests: string; unread: string; questions: string }>(
    `SELECT
       (SELECT COUNT(*) FROM conversations WHERE recipient_id = $1 AND status = 'REQUESTED' AND expires_at > now()) AS requests,
       (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id
          WHERE (c.initiator_id = $1 OR c.recipient_id = $1) AND m.sender_id <> $1 AND m.status = 'DELIVERED' AND m.read_at IS NULL) AS unread,
       (SELECT COUNT(*) FROM ai_questions WHERE user_id = $1 AND status = 'OPEN') AS questions`, [u.id])
  return (
    <LangProvider lang={u.lang}>
      <LiveProvider />
      <div className="min-h-dvh pb-20">
        {u.status === 'FROZEN' && (
          <div className="bg-red-50 text-red-800 text-sm px-4 py-2 text-center border-b border-red-200">
            {u.lang === 'ml' ? 'നിങ്ങളുടെ അക്കൗണ്ട് താൽക്കാലികമായി നിർത്തിയിരിക്കുന്നു — വായിക്കാം, അയയ്ക്കാനാവില്ല.' : 'Your account is paused — you can read but not send.'}
            {u.frozen_until && ` (${new Date(u.frozen_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})`}
          </div>
        )}
        {children}
      </div>
      <BottomNav inbox={Number(counts?.requests ?? 0) + Number(counts?.unread ?? 0)} questions={Number(counts?.questions ?? 0)} />
    </LangProvider>
  )
}
