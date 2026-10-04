import { z } from 'zod'
import { handle, ok } from '@/lib/server/http.ts'
import { apiUser } from '@/lib/server/auth.ts'
import { answer, nextQuestion, interviewState, MAX_QUESTIONS } from '@/lib/domain/interview.ts'
import { q0 } from '@/lib/server/db.ts'
import { DomainError } from '@/lib/pg.ts'
import { AiUnavailable } from '@/lib/ai/llm.ts'
import type { User } from '@/lib/types.ts'

async function state(u: User) {
  let question: string | null
  try {
    question = await nextQuestion(u)
  } catch (err) {
    if (err instanceof AiUnavailable) {
      console.error('[interview]', err.message)
      throw new DomainError('Our assistant is busy for a moment. Tap retry.')
    }
    throw err
  }
  const row = await q0<{ about: string | null }>('SELECT about FROM users WHERE id = $1', [u.id])
  const { turns, answered } = await interviewState(u)
  return { question, about: question ? null : row?.about ?? null, answered, max: MAX_QUESTIONS, turns }
}

export const GET = handle(async () => ok(await state(await apiUser())))

export const POST = handle(async (req: Request) => {
  const u = await apiUser()
  const { text } = z.object({ text: z.string() }).parse(await req.json())
  await answer(u, text)
  return ok(await state(u))
})
