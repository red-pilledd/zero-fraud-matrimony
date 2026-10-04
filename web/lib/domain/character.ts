import 'server-only'
import { z } from 'zod'
import { q, q0, tx } from '../server/db.ts'
import { getSettings } from '../server/settings.ts'
import { publish } from '../server/bus.ts'
import { askJson, AiUnavailable } from '../ai/llm.ts'
import { ageFrom, type User } from '../types.ts'

// The internal character read. Built from everything a member writes — interview answers,
// answers to private clarifying questions, and their own chat lines across all conversations.
// NEVER shown to other members. Used for: ranking (trust_score), safety review, intent re-routing,
// and deciding when a contact exchange is safe.

const RISK_TYPES = ['SCAM_PATTERN', 'AGGRESSION', 'CONTROLLING', 'INCONSISTENT_STORY', 'POSSIBLY_MARRIED', 'POSSIBLY_MINOR', 'FAKE_PROFILE', 'OTHER'] as const

// 0-100; tolerates "85", "85/100", or junk (→ 50 = no evidence)
const score = z.preprocess((v) => {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50
}, z.number().int().min(0).max(100))

export const Character = z.object({
  summary: z.string().max(1500),
  traits: z.array(z.string().max(80)).transform((a) => a.slice(0, 10)),
  values: z.array(z.string().max(80)).transform((a) => a.slice(0, 8)),
  communication_style: z.string().max(400).catch(''),
  observed_intent: z.preprocess((v) => (['MARRIAGE', 'LONG_TERM', 'CASUAL'].includes(String(v)) ? v : 'UNCLEAR'),
    z.enum(['MARRIAGE', 'LONG_TERM', 'CASUAL', 'UNCLEAR'])),
  intent_matches_declared: z.boolean(),
  intent_evidence: z.string().max(600).catch(''),
  respectfulness: score,
  sincerity: score,
  trust_score: score,
  risk_flags: z.array(z.preprocess((v) => (typeof v === 'string' ? { type: 'OTHER', evidence: v } : v), z.object({
    type: z.preprocess((v) => (RISK_TYPES.includes(String(v) as never) ? v : 'OTHER'), z.enum(RISK_TYPES)),
    evidence: z.string().max(400),
  }))).catch([]).transform((a) => a.slice(0, 5)),
  questions: z.array(z.preprocess((v) => (typeof v === 'string' ? { question: v, why: '' } : v),
    z.object({ question: z.string().max(400), why: z.string().max(300).catch('') }))).catch([]).transform((a) => a.slice(0, 2)),
})
export type Character = z.infer<typeof Character>

const POOL_WORDS = { MARRIAGE: 'marriage', LONG_TERM: 'a long-term relationship (not marriage)', CASUAL: 'casual dating' }

const SYSTEM = `You study members of an Indian (mainly Kerala) matrimony & relationships platform so the platform can keep
people safe and route them to the right people. You read what ONE member has written: their onboarding interview, their answers
to our private questions, and their own lines from chats with other members. Your read is private to the platform's
operators; the member and other members never see it, so be honest, specific and evidence-based — never invent.

Judge from behaviour, not from claims. Look for: kindness vs. contempt, honesty, consistency of their story over time,
pressure tactics, money talk (scam patterns: quick intimacy then money/investment), signs they are already married,
signs of being under 18, signs the profile is fake or a different person is writing, controlling or possessive talk.
Note that on family-managed profiles a parent or sibling may be the one writing — that is normal, not a red flag.

observed_intent: what they actually seem to want from their behaviour. intent_matches_declared: false only with clear evidence
(e.g. someone in the marriage section repeatedly steering to casual/physical, or someone in casual dating pressing for marriage).
risk_flags: ONLY genuine danger signs (scams, aggression, deception, a hidden marriage, a minor, a fake profile). Do NOT flag
rule slips the screener already blocked, ordinary eagerness to exchange numbers, or the intent mismatch (that is reported separately).
trust_score: 0-100 overall safety/sincerity for ranking (50 = no evidence either way, new members start near 50).
questions: up to 2 short, friendly, private clarifying questions to ask THIS member to fill real gaps or resolve contradictions in
what we know (e.g. "You mentioned moving abroad — is that a must for you, or open?"). Never accusatory. Write them in
the member's language. Empty array if nothing useful to ask. Do not repeat questions already asked.

Output exactly this shape:
{"summary":"3-5 sentences","traits":["..."],"values":["..."],"communication_style":"...",
 "observed_intent":"MARRIAGE|LONG_TERM|CASUAL|UNCLEAR","intent_matches_declared":true,"intent_evidence":"...",
 "respectfulness":0-100,"sincerity":0-100,"trust_score":0-100,
 "risk_flags":[{"type":"SCAM_PATTERN|AGGRESSION|CONTROLLING|INCONSISTENT_STORY|POSSIBLY_MARRIED|POSSIBLY_MINOR|FAKE_PROFILE|OTHER","evidence":"..."}],
 "questions":[{"question":"...","why":"..."}]}`

export async function refreshCharacter(userId: number): Promise<Character | null> {
  const u = await q0<User>('SELECT * FROM users WHERE id = $1', [userId])
  if (!u || !u.pool) return null
  const interview = await q<{ role: string; content: string }>(
    'SELECT role, content FROM interview_turns WHERE user_id = $1 ORDER BY id', [userId])
  const qa = await q<{ question: string; answer: string | null; status: string }>(
    'SELECT question, answer, status FROM ai_questions WHERE user_id = $1 ORDER BY id DESC LIMIT 20', [userId])
  const lines = await q<{ conversation_id: number; body: string; created_at: string }>(
    `SELECT conversation_id, body, created_at FROM messages
      WHERE sender_id = $1 AND status IN ('DELIVERED','BLOCKED') ORDER BY id DESC LIMIT 120`, [userId])
  const blocked = await q<{ category: string; n: string }>(
    `SELECT category, COUNT(*) AS n FROM messages WHERE sender_id = $1 AND status = 'BLOCKED' GROUP BY category`, [userId])

  const prompt = [
    `MEMBER: ${u.display_name ?? 'member'}, ${u.gender === 'MAN' ? 'man' : 'woman'}, age ${ageFrom(u.dob) ?? '?'}, ${u.marital_status ?? ''}, ${u.district ?? ''}`,
    `Profile created by: ${u.created_by}. Declared they are looking for: ${POOL_WORDS[u.pool]}.`,
    `Writes in: ${u.lang === 'ml' ? 'Malayalam' : 'English'}. Strikes so far: ${u.strikes}.`,
    u.created_by !== 'SELF'
      ? 'IMPORTANT: this profile is managed by family. Questions must be about marriage only — never mention dating, casual, long-term-without-marriage or any other section.'
      : '',
    blocked.length ? `Messages our screener blocked: ${blocked.map((b) => `${b.category} ×${b.n}`).join(', ')}` : 'No blocked messages.',
    '',
    'PREVIOUS READ (update it, do not just copy it):',
    u.character ? JSON.stringify(u.character) : '(none yet)',
    '',
    'ONBOARDING INTERVIEW:',
    interview.map((t) => `${t.role === 'ai' ? 'Q' : 'A'}: ${t.content}`).join('\n') || '(none)',
    '',
    'PRIVATE QUESTIONS WE ASKED:',
    qa.map((x) => `Q: ${x.question}\nA: ${x.answer ?? `(${x.status.toLowerCase()})`}`).join('\n') || '(none)',
    '',
    'THEIR OWN CHAT LINES (newest first; [c#] = which conversation):',
    lines.map((l) => `[c${l.conversation_id}] ${l.body}`).join('\n') || '(no chats yet)',
  ].join('\n')

  const ch = await askJson('deep', Character, SYSTEM, [{ role: 'user', text: prompt }], { maxTokens: 6000, userId, effort: 'medium' })

  await tx(async (db) => {
    await db.query(
      `UPDATE users SET character = $2, trust_score = $3, character_at_msgs = msgs_delivered, character_updated_at = now() WHERE id = $1`,
      [userId, JSON.stringify(ch), ch.trust_score])
    const asked = new Set(qa.map((x) => x.question.trim().toLowerCase()))
    for (const qn of ch.questions) {
      if (asked.has(qn.question.trim().toLowerCase())) continue
      await db.query(`INSERT INTO ai_questions (user_id, question, why) VALUES ($1,$2,$3)`, [userId, qn.question, qn.why])
    }
    if (!ch.intent_matches_declared && ch.observed_intent !== 'UNCLEAR' && ch.observed_intent !== u.pool) {
      const open = await db.query(
        `SELECT 1 FROM moderation_events WHERE user_id = $1 AND kind = 'INTENT_MISMATCH' AND resolved_at IS NULL`, [userId])
      if (!open.rowCount) {
        await db.query(
          `INSERT INTO moderation_events (user_id, kind, category, detail, needs_review)
           VALUES ($1,'INTENT_MISMATCH',$2,$3,true)`,
          [userId, ch.observed_intent, `Declared ${u.pool}, behaves like ${ch.observed_intent}: ${ch.intent_evidence}`])
      }
    }
    for (const f of ch.risk_flags) {
      const dup = await db.query(
        `SELECT 1 FROM moderation_events WHERE user_id = $1 AND kind = 'RISK_FLAG' AND category = $2 AND resolved_at IS NULL`, [userId, f.type])
      if (!dup.rowCount) {
        await db.query(
          `INSERT INTO moderation_events (user_id, kind, category, detail, needs_review) VALUES ($1,'RISK_FLAG',$2,$3,true)`,
          [userId, f.type, f.evidence])
      }
    }
  })
  if (ch.questions.length) publish(userId, { type: 'questions' })
  return ch
}

const running = new Set<number>()

/** Rebuild the read every N delivered messages. Fire-and-forget from the message pipeline. */
export async function maybeRefreshCharacter(userId: number) {
  if (running.has(userId)) return
  const { character_every_msgs } = await getSettings()
  const u = await q0<{ msgs_delivered: number; character_at_msgs: number }>(
    'SELECT msgs_delivered, character_at_msgs FROM users WHERE id = $1', [userId])
  if (!u || u.msgs_delivered - u.character_at_msgs < character_every_msgs) return
  running.add(userId)
  try {
    await refreshCharacter(userId)
  } catch (err) {
    if (!(err instanceof AiUnavailable)) throw err
    console.error(`[character] user ${userId} skipped: ${err.message}`)
  } finally {
    running.delete(userId)
  }
}
