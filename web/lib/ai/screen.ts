import 'server-only'
import { z } from 'zod'
import { askJson } from './llm.ts'
import type { Pool } from '../types.ts'

// Layer 2 of message screening. Every message that survives the free rules is read by a model,
// together with the last few lines of the conversation, before the other person can see it.

export const CATEGORIES = [
  'NONE', 'CONTACT_INFO', 'SEXUAL', 'ABUSE', 'HATE', 'SCAM', 'SOLICITATION', 'THREAT', 'MINOR', 'SELF_HARM',
] as const
export type Category = (typeof CATEGORIES)[number]

export const ScreenVerdict = z.object({
  verdict: z.enum(['ALLOW', 'BLOCK']),
  category: z.enum(CATEGORIES),
  severity: z.preprocess((v) => (String(v).toUpperCase() === 'HIGH' ? 'HIGH' : 'LOW'), z.enum(['LOW', 'HIGH'])),
  user_note: z.string().max(400).catch(''),   // shown to the sender when blocked — polite, specific, never accusatory
  internal: z.string().max(600).catch(''),    // for the moderator
})
export type ScreenVerdict = z.infer<typeof ScreenVerdict>

const POOL_CONTEXT: Record<Pool, string> = {
  MARRIAGE: 'This is a matrimony conversation between two people (or a family member on their behalf) considering marriage. Courteous, warm, family-oriented talk is normal.',
  LONG_TERM: 'This is a conversation between two adults looking for a long-term relationship (not necessarily marriage). Romance and affection are normal.',
  CASUAL: 'This is a conversation between two adults open to casual dating. Flirting and playful talk are normal and allowed.',
}

const SYSTEM = `You are the message screener for an Indian (mainly Kerala) matrimony and relationships app.
Every message is checked by you BEFORE the other person sees it. You judge ONLY the NEW MESSAGE. The earlier conversation
is context for understanding it (e.g. a number continued across messages, or what a reply refers to) — never block a new
message for something an earlier message did; earlier rule breaks were already handled. Messages may be in English, Malayalam script,
Manglish (romanised Malayalam), Hindi or a mix. You see the recent conversation for context.

BLOCK the new message if it does any of these:
- CONTACT_INFO: shares or asks for any way to reach someone outside the app, in ANY disguised form — phone numbers
  (digits, words, Malayalam/other scripts, split across messages, maths puzzles, "first part / second part"),
  email, Instagram/Snapchat/Telegram/WhatsApp/Facebook IDs or usernames ("search me as...", "my insta is my name+year"),
  links, UPI IDs, bank details, exact home address or house name. → severity HIGH when they actually GIVE such a detail.
  Directly ASKING the other person for their number/ID/address is also CONTACT_INFO but severity LOW (they get guided to the
  in-app "Exchange contacts" button, no penalty).
  NOT contact info (ALLOW): saying they'd like to talk on the phone or meet someday, asking whether the other person is
  comfortable exchanging numbers or talking by phone, city/district/town names, general workplace type, college names,
  suggesting meeting "in a public place" without contact details. If CONTACT EXCHANGE IS APPROVED for this conversation, contact details are ALLOWED.
- SEXUAL: explicit or graphic sexual content, sexual body talk, requests for nude/intimate photos, sexting.
  Flirting, compliments ("you look lovely"), romance, affection, talking about attraction in a non-graphic way are FINE.
- ABUSE: insults, slurs, harassment, demeaning someone, swearing aimed at the person (incl. Malayalam/Manglish abuse).
- HATE: attacks on religion, caste, community, gender, skin colour.
- SCAM: asking for money, gifts, recharges, loans, investment/crypto/forex/trading pitches, "customs/parcel" stories,
  sob stories that end in money, links to "earning" schemes.
- SOLICITATION: offering or asking for paid sex / escort services.
- THREAT: threats, blackmail, threats to share someone's photos or chats.
- MINOR: the sender says or clearly implies they (or the person they are discussing meeting) are under 18.
SELF_HARM: if the sender talks about wanting to hurt themselves, verdict is ALLOW with category SELF_HARM (we deliver it and
reach out to them with help) — never block a cry for help.

Everything else is ALLOW with category NONE. Be fair: ordinary conversation must flow. Do not block for spelling,
mild slang, disagreement, talking about family, religion or money in a normal way (salary, dowry views, job), or
for mentioning an app name with no handle ("I don't use Instagram much").
severity HIGH = clear-cut and deliberate (e.g. an actual number, an actual money request, explicit content); LOW = borderline.
user_note: if BLOCK, one short kind sentence to the SENDER explaining what to change, in the same language they wrote in
(e.g. "Phone numbers can't be shared yet — keep talking here, and use 'Exchange contacts' when you're both ready.").
If ALLOW, user_note is "".
internal: one line for the moderator saying why.

Output shape (exactly these keys):
{"verdict":"ALLOW|BLOCK","category":"NONE|CONTACT_INFO|SEXUAL|ABUSE|HATE|SCAM|SOLICITATION|THREAT|MINOR|SELF_HARM","severity":"LOW|HIGH","user_note":"...","internal":"..."}
When verdict is ALLOW use severity "LOW".`

export async function aiScreen(input: {
  pool: Pool
  createdByFamily: boolean
  contactApproved: boolean
  history: Array<{ who: 'SENDER' | 'OTHER'; text: string }>
  message: string
  hints: string[]
  userId: number
}): Promise<ScreenVerdict> {
  const convo = input.history.length
    ? input.history.map((h) => `${h.who}: ${h.text}`).join('\n')
    : '(no earlier messages)'
  const prompt = [
    POOL_CONTEXT[input.pool],
    input.createdByFamily ? "The sender's profile is managed by a family member, who may be writing." : '',
    input.contactApproved
      ? 'CONTACT EXCHANGE APPROVED: YES. These two people were approved to exchange contact details, so phone numbers, social handles, email and address are now ALLOWED — never use CONTACT_INFO in this conversation.'
      : 'CONTACT EXCHANGE APPROVED: NO',
    '',
    'Recent conversation (oldest first):',
    convo,
    '',
    input.hints.length ? `Automatic checks noticed: ${input.hints.join('; ')}. Look closely, but these are only hints.` : '',
    'NEW MESSAGE FROM SENDER:',
    input.message,
  ].filter((l) => l !== '').join('\n')
  return askJson('screen', ScreenVerdict, SYSTEM, [{ role: 'user', text: prompt }], { maxTokens: 800, userId: input.userId })
}
