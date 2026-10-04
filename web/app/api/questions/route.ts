import { z } from 'zod'
import { handle, ok } from '@/lib/server/http.ts'
import { apiUser } from '@/lib/server/auth.ts'
import { q, q0 } from '@/lib/server/db.ts'
import { DomainError } from '@/lib/pg.ts'
import { screenRules } from '@/lib/moderation/rules.ts'

// The private assistant: questions the AI wants to ask this member. Answers feed their character read.
export const GET = handle(async () => {
  const u = await apiUser({ onboarded: true })
  const items = await q<{ id: number; question: string; answer: string | null; status: string; created_at: string }>(
    `SELECT id, question, answer, status, created_at FROM ai_questions WHERE user_id = $1 ORDER BY (status = 'OPEN') DESC, id DESC LIMIT 50`, [u.id])
  return ok({ items })
})

export const POST = handle(async (req: Request) => {
  const u = await apiUser({ onboarded: true })
  const b = z.object({ id: z.number().int(), answer: z.string().max(1500).optional(), skip: z.boolean().optional() }).parse(await req.json())
  const row = await q0(`SELECT 1 FROM ai_questions WHERE id = $1 AND user_id = $2 AND status = 'OPEN'`, [b.id, u.id])
  if (!row) throw new DomainError('Question not found')
  if (b.skip) {
    await q(`UPDATE ai_questions SET status = 'SKIPPED', answered_at = now() WHERE id = $1`, [b.id])
  } else {
    const a = (b.answer ?? '').trim()
    if (a.length < 2) throw new DomainError('Write an answer, or tap Skip')
    if (screenRules(a, { senderRecent: [], contactApproved: false }).block) throw new DomainError("Please don't include contact details.")
    await q(`UPDATE ai_questions SET status = 'ANSWERED', answer = $2, answered_at = now() WHERE id = $1`, [b.id, a])
  }
  return ok()
})
