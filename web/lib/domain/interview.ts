import 'server-only'
import { z } from 'zod'
import { q, q0 } from '../server/db.ts'
import { askJson } from '../ai/llm.ts'
import { DomainError } from '../pg.ts'
import { screenRules } from '../moderation/rules.ts'
import { ageFrom, type User } from '../types.ts'

// The onboarding interview replaces a typed bio. A short, adaptive conversation; at the end the AI
// writes the public "About" (which the member approves) and the answers seed the private character read.

export const MAX_QUESTIONS = 7

const Step = z.object({
  done: z.boolean(),
  question: z.string().max(800).catch(''),
})
const Final = z.object({
  about: z.string().min(40).max(2000),
})

const FOCUS = {
  MARRIAGE: 'what they are looking for in a life partner, family and values, how they imagine married life (where to live, joint/nuclear family, career after marriage), lifestyle, faith (only if they bring it up), deal-breakers, and how they handle disagreements',
  LONG_TERM: 'what a good relationship looks like to them, why marriage is not their plan right now (gently, only if natural), lifestyle, what they enjoy, deal-breakers, and how they handle disagreements',
  CASUAL: 'what they enjoy doing, what a good date looks like, the kind of person they get along with, and their boundaries — keep it light and fun, never sexual',
}

function who(u: User): string {
  const rel = { SELF: 'the member themselves', PARENT: 'a parent of the member', SIBLING: 'a sibling of the member', RELATIVE: 'a relative of the member', FRIEND: 'a friend of the member' }[u.created_by]
  return `The person answering is ${rel}. The member: ${u.display_name}, ${u.gender === 'MAN' ? 'man' : 'woman'}, ${ageFrom(u.dob)} years, ${u.marital_status?.replace('_', ' ').toLowerCase() ?? ''}, ${u.occupation ?? ''}, from ${u.district ?? ''}.`
}

function system(u: User): string {
  const lang = u.lang === 'ml' ? 'Malayalam (simple, everyday Malayalam script)' : 'simple English'
  return `You are the warm, respectful host of an Indian (Kerala) matrimony & relationships app, getting to know a new member
through a short conversation instead of a form. ${who(u)}
Ask ONE short question at a time (max 2 sentences), in ${lang}. Build on their previous answers — a natural conversation, not a survey.
Cover: ${FOCUS[u.pool!]}.
Never ask for phone numbers, social media, exact address, income figures or anything intimate. If the person answering is a family
member, ask about the member in third person ("What is she like at home?").
Ask at most ${MAX_QUESTIONS} questions in total. Set done=true when you have a good picture (at least 5 answers) or after question ${MAX_QUESTIONS}.`
}

export async function interviewState(u: User) {
  const turns = await q<{ role: 'ai' | 'user'; content: string }>('SELECT role, content FROM interview_turns WHERE user_id = $1 ORDER BY id', [u.id])
  return { turns, answered: turns.filter((t) => t.role === 'user').length }
}

const inFlight = new Map<number, Promise<string | null>>()

/** Returns the next question, or null when the interview is complete (and the About has been drafted).
 *  Concurrent calls for the same member share one AI call, so a double page-load can't ask twice. */
export function nextQuestion(u: User): Promise<string | null> {
  const running = inFlight.get(u.id)
  if (running) return running
  const p = nextQuestionInner(u).finally(() => inFlight.delete(u.id))
  inFlight.set(u.id, p)
  return p
}

async function nextQuestionInner(u: User): Promise<string | null> {
  const { turns, answered } = await interviewState(u)
  const last = turns[turns.length - 1]
  if (last?.role === 'ai') return last.content
  if (answered < MAX_QUESTIONS) {
    const transcript = turns.map((t) => `${t.role === 'ai' ? 'HOST' : 'MEMBER'}: ${t.content}`).join('\n')
    const step = await askJson('deep', Step, system(u), [{
      role: 'user',
      text: transcript ? `Conversation so far:\n${transcript}\n\nAnswers so far: ${answered}. Give the next question or done.` : 'Start the conversation with a friendly first question.',
    }], { maxTokens: 2000, userId: u.id, effort: 'low' })
    if (!(step.done && answered >= 5) && step.question.trim()) {
      // only if nobody else asked meanwhile (e.g. another server process)
      await q(`INSERT INTO interview_turns (user_id, role, content)
               SELECT $1,'ai',$2 WHERE NOT EXISTS (
                 SELECT 1 FROM interview_turns t WHERE t.user_id = $1 AND t.role = 'ai'
                    AND t.id = (SELECT MAX(id) FROM interview_turns WHERE user_id = $1))`, [u.id, step.question.trim()])
      const latest = await q<{ content: string }>(`SELECT content FROM interview_turns WHERE user_id = $1 ORDER BY id DESC LIMIT 1`, [u.id])
      return latest[0].content
    }
  }
  await draftAbout(u)
  return null
}

export async function answer(u: User, text: string) {
  const t = text.trim()
  if (t.length < 2) throw new DomainError('Write a little more')
  if (t.length > 1500) throw new DomainError('Please keep it shorter (1500 characters max)')
  const rules = screenRules(t, { senderRecent: [], contactApproved: false })
  if (rules.block) throw new DomainError("Please don't include phone numbers, links or social media IDs here.")
  const { turns } = await interviewState(u)
  if (turns[turns.length - 1]?.role !== 'ai') throw new DomainError('No question to answer')
  await q(`INSERT INTO interview_turns (user_id, role, content) VALUES ($1,'user',$2)`, [u.id, t])
}

export async function draftAbout(u: User): Promise<string> {
  const { turns } = await interviewState(u)
  const lang = u.lang === 'ml' ? 'Malayalam' : 'English'
  const res = await askJson('deep', Final, `You write the public "About" section of a matrimony/relationships profile from an onboarding conversation.
${who(u)}
Write 60–120 words in ${lang}, ${u.created_by === 'SELF' ? 'first person' : 'third person, as written by the family'}, warm and specific, using
only what was actually said. No contact details, no income figures, no exaggeration, no clichés like "simple and down-to-earth" unless they said it.`,
  [{ role: 'user', text: turns.map((t) => `${t.role === 'ai' ? 'HOST' : 'MEMBER'}: ${t.content}`).join('\n') }], { maxTokens: 4000, userId: u.id, effort: 'low' })
  await q('UPDATE users SET about = $2 WHERE id = $1', [u.id, res.about])
  return res.about
}

export async function interviewDone(u: User): Promise<boolean> {
  const r = await q0<{ about: string | null }>('SELECT about FROM users WHERE id = $1', [u.id])
  return !!r?.about
}
