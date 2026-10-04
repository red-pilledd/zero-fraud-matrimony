import 'server-only'
import { z } from 'zod'
import { q, q0 } from './db.ts'

// Everything an operator may want to change without a code deploy lives here.
// Values are stored in the settings table; anything missing falls back to these defaults.
export const SettingsSchema = z.object({
  brand_name: z.string().min(1).max(40),
  price_paise: z.object({
    MARRIAGE: z.number().int().min(100),
    LONG_TERM: z.number().int().min(100),
    CASUAL: z.number().int().min(100),
  }),
  reply_window_hours: z.number().int().min(1).max(24 * 14),
  // contact exchange: AI is only consulted once these floors are met
  contact_min_messages: z.number().int().min(0),
  contact_min_each: z.number().int().min(0),
  contact_min_hours: z.number().int().min(0),
  contact_retry_hours: z.number().int().min(1),
  // character profile is rebuilt every N delivered messages from that user
  character_every_msgs: z.number().int().min(5),
  strike_freeze_at: z.number().int().min(1),
  strike_ban_at: z.number().int().min(2),
  freeze_days: z.number().int().min(1),
  ai: z.object({
    screen: z.object({ provider: z.enum(['anthropic', 'gemini']), model: z.string() }),
    deep: z.object({ provider: z.enum(['anthropic', 'gemini']), model: z.string() }),     // character, contact review, interview
    vision: z.object({ provider: z.enum(['anthropic', 'gemini']), model: z.string() }),   // photo + selfie checks
  }),
  // USD per million tokens, used for the cost meter on the admin dashboard
  ai_rates: z.record(z.string(), z.object({ in: z.number(), out: z.number() })),
  usd_inr: z.number().positive(),
})
export type Settings = z.infer<typeof SettingsSchema>

export const DEFAULTS: Settings = {
  brand_name: process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Thuna',
  price_paise: { MARRIAGE: 9900, LONG_TERM: 9900, CASUAL: 9900 },
  reply_window_hours: 48,
  contact_min_messages: 30,
  contact_min_each: 10,
  contact_min_hours: 24,
  contact_retry_hours: 24,
  character_every_msgs: 20,
  strike_freeze_at: 2,
  strike_ban_at: 3,
  freeze_days: 7,
  ai: {
    screen: { provider: 'anthropic', model: 'claude-haiku-4-5' },
    // Sonnet: natural Malayalam for the interview/questions, better judgement for character + contact reviews and faces
    deep: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
    vision: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
  },
  ai_rates: {
    'claude-haiku-4-5': { in: 1, out: 5 },
    'claude-sonnet-5-5': { in: 2, out: 10 },
    'claude-opus-5-5': { in: 4, out: 20 },
    'gemini-2.5-flash-lite': { in: 0.1, out: 0.4 },
    'gemini-2.5-flash': { in: 0.3, out: 2.5 },
  },
  usd_inr: 88,
}

let cache: { at: number; value: Settings } | null = null

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < 15_000) return cache.value
  const r = await q0<{ value: unknown }>(`SELECT value FROM settings WHERE key = 'app'`)
  const merged = { ...DEFAULTS, ...((r?.value as object) ?? {}) }
  const parsed = SettingsSchema.safeParse(merged)
  const value = parsed.success ? parsed.data : DEFAULTS
  cache = { at: Date.now(), value }
  return value
}

export async function saveSettings(next: Settings): Promise<void> {
  const v = SettingsSchema.parse(next)
  await q(`INSERT INTO settings (key, value) VALUES ('app', $1)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [JSON.stringify(v)])
  cache = null
}

export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
