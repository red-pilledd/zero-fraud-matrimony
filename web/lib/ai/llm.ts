import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { q } from '../server/db.ts'
import { getSettings } from '../server/settings.ts'

// One door to every model. Callers say which job they are doing ('screen', 'deep', 'vision');
// the admin settings decide which provider/model does that job, so switching Claude <-> Gemini
// is a settings change, not a code change. Every call is metered into ai_usage.

export type Task = 'screen' | 'deep' | 'vision'
export type Img = { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; base64: string }
export type Turn = { role: 'user' | 'assistant'; text: string; images?: Img[] }

export class AiUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiUnavailable'
  }
}

/** The model declined to process this content (safety refusal). Distinct from being unreachable. */
export class AiRefused extends AiUnavailable {
  constructor(message: string) {
    super(message)
    this.name = 'AiRefused'
  }
}

type Raw = { text: string; inTok: number; outTok: number }
export type Effort = 'low' | 'medium' | 'high'

let client: Anthropic | null = null
function anthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiUnavailable('ANTHROPIC_API_KEY is not set')
  // retries 429 / 5xx / connection errors twice on its own
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 45_000, maxRetries: 2 })
  return client
}

// Models that accept server-side refusal fallbacks ("default" routes by refusal category).
const FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1'])

async function anthropic(model: string, system: string, turns: Turn[], maxTokens: number, effort?: Effort): Promise<Raw> {
  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t) => ({
    role: t.role,
    content: [
      ...(t.images ?? []).map((i) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.mediaType, data: i.base64 } })),
      { type: 'text' as const, text: t.text },
    ],
  }))
  try {
    const res = FALLBACK_MODELS.has(model)
      ? await anthropicClient().beta.messages.create({
          model, max_tokens: maxTokens, system, messages,
          betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
          ...(effort ? { output_config: { effort } } : {}),
        })
      : await anthropicClient().beta.messages.create({ model, max_tokens: maxTokens, system, messages })
    if (res.stop_reason === 'refusal') throw new AiRefused(`model refused (${res.stop_details?.category ?? 'unspecified'})`)
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    return { text, inTok: res.usage.input_tokens, outTok: res.usage.output_tokens }
  } catch (err) {
    if (err instanceof AiUnavailable) throw err
    if (err instanceof Anthropic.APIError) throw new AiUnavailable(`Anthropic ${err.status ?? ''}: ${err.message.slice(0, 300)}`)
    throw new AiUnavailable(err instanceof Error ? err.message : String(err))
  }
}

async function gemini(model: string, system: string, turns: Turn[], maxTokens: number, json: boolean): Promise<Raw> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new AiUnavailable('GEMINI_API_KEY is not set')
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: turns.map((t) => ({
        role: t.role === 'assistant' ? 'model' : 'user',
        parts: [...(t.images ?? []).map((i) => ({ inline_data: { mime_type: i.mediaType, data: i.base64 } })), { text: t.text }],
      })),
      generationConfig: { maxOutputTokens: maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
    }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) throw new AiUnavailable(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const j = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  }
  return {
    text: j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '',
    inTok: j.usageMetadata?.promptTokenCount ?? 0,
    outTok: j.usageMetadata?.candidatesTokenCount ?? 0,
  }
}

async function call(task: Task, system: string, turns: Turn[], maxTokens: number, json: boolean, userId?: number, effort?: Effort): Promise<string> {
  const s = await getSettings()
  const { provider, model } = s.ai[task]
  const t0 = Date.now()
  let raw: Raw | null = null
  try {
    raw = provider === 'gemini' ? await gemini(model, system, turns, maxTokens, json) : await anthropic(model, system, turns, maxTokens, effort)
    return raw.text
  } catch (err) {
    if (err instanceof AiUnavailable) throw err
    throw new AiUnavailable(err instanceof Error ? err.message : String(err))
  } finally {
    const rate = s.ai_rates[model] ?? { in: 0, out: 0 }
    const cost = raw ? (raw.inTok * rate.in + raw.outTok * rate.out) / 1_000_000 : 0
    q(`INSERT INTO ai_usage (task, provider, model, input_tokens, output_tokens, cost_usd, ms, ok, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [task, provider, model, raw?.inTok ?? 0, raw?.outTok ?? 0, cost.toFixed(6), Date.now() - t0, !!raw, userId ?? null],
    ).catch((e) => console.error('[ai_usage]', e.message))
  }
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('no JSON object in model output')
  return JSON.parse(text.slice(start, end + 1))
}

/**
 * Ask a model for JSON matching a schema. One retry on a malformed answer; after that the
 * caller gets AiUnavailable and must fall back to its safe default (usually: hold, don't deliver).
 */
export async function askJson<T>(
  task: Task, schema: z.ZodType<T>, system: string, turns: Turn[], opts: { maxTokens?: number; userId?: number; effort?: Effort } = {},
): Promise<T> {
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape
  const keys = shape ? ` It must have exactly these top-level keys: ${Object.keys(shape).join(', ')}.` : ''
  const sys = `${system}\n\nRespond with a single JSON object only — no prose, no markdown fences.${keys}`
  let lastErr = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await call(task, sys, turns, opts.maxTokens ?? 2000, true, opts.userId, opts.effort)
    try {
      return schema.parse(extractJson(text))
    } catch (err) {
      lastErr = `${err instanceof Error ? err.message : String(err)} | output: ${text.slice(0, 300)}`
    }
  }
  throw new AiUnavailable(`model returned unusable JSON: ${lastErr.slice(0, 600)}`)
}
