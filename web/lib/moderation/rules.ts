// Layer 1 of message screening: deterministic rules that cost nothing and run in microseconds.
// They do two jobs: block the unambiguous cases outright (a phone number is a phone number),
// and hand the AI layer hints about what looked suspicious.
// No server-only import: this file is pure so it can be unit-tested with plain node.

export type RuleHit = { category: 'CONTACT_INFO'; reason: string }
export type RuleResult = { block: RuleHit | null; hints: string[] }

const DIGIT_BLOCKS: Array<[number, number]> = [
  [0x0d66, 0x0d6f], // Malayalam
  [0x0966, 0x096f], // Devanagari
  [0x0be6, 0x0bef], // Tamil
  [0x0ce6, 0x0cef], // Kannada
  [0x0c66, 0x0c6f], // Telugu
  [0x0660, 0x0669], // Arabic-Indic
  [0x06f0, 0x06f9], // Extended Arabic-Indic
]

// number words people use to dodge digit filters. Order matters: longer spellings first.
const NUMBER_WORDS: Array<[RegExp, string]> = [
  // Malayalam script
  [/പൂജ്യം|പൂജ്യ/g, '0'], [/ഒന്ന്|ഒന്നു/g, '1'], [/രണ്ട്|രണ്ടു/g, '2'], [/മൂന്ന്|മൂന്നു/g, '3'],
  [/നാല്|നാലു/g, '4'], [/അഞ്ച്|അഞ്ചു/g, '5'], [/ആറ്|ആറു/g, '6'], [/ഏഴ്|ഏഴു/g, '7'],
  [/എട്ട്|എട്ടു/g, '8'], [/ഒമ്പത്|ഒൻപത്|ഒമ്പതു/g, '9'],
  // English
  [/\bzero\b/g, '0'], [/\bone\b/g, '1'], [/\btwo\b/g, '2'], [/\bthree\b/g, '3'], [/\bfour\b/g, '4'],
  [/\bfive\b/g, '5'], [/\bsix\b/g, '6'], [/\bseven\b/g, '7'], [/\beight\b/g, '8'], [/\bnine\b/g, '9'],
  // Manglish (romanised Malayalam)
  [/\b(poojyam|pujyam|poojiyam|shoonyam|sunyam)\b/g, '0'], [/\b(onnu|onn)\b/g, '1'], [/\b(randu|rand|rendu)\b/g, '2'],
  [/\b(moonu|moonnu|munnu|moonn)\b/g, '3'], [/\b(naalu|nalu|naal)\b/g, '4'], [/\b(anju|anchu|anj)\b/g, '5'],
  [/\b(aaru|aar)\b/g, '6'], [/\b(ezhu|ezh|eyu)\b/g, '7'], [/\b(ettu|ett)\b/g, '8'],
  [/\b(onpathu|ombathu|ombadu|onpath|ombath)\b/g, '9'],
]

const SEP = String.raw`[\s\-\.\,\(\)\/\*_+|:;~'"]`

/** Lowercase, unify digit scripts, turn spoken numbers into digits, glue digits split by separators. */
export function normalizeDigits(text: string): string {
  let s = text.normalize('NFKC').toLowerCase()
  s = s.replace(/[٠-൯]/g, (ch) => {
    const c = ch.codePointAt(0)!
    for (const [lo, hi] of DIGIT_BLOCKS) if (c >= lo && c <= hi) return String(c - lo)
    return ch
  })
  for (const [re, d] of NUMBER_WORDS) s = s.replace(re, d)
  s = s.replace(/\b(double|triple)\s*(\d)/g, (_, k: string, d: string) => d.repeat(k === 'double' ? 2 : 3))
  const glue = new RegExp(String.raw`(\d)${SEP}+(?=\d)`, 'g')
  let prev = ''
  while (prev !== s) { prev = s; s = s.replace(glue, '$1') }
  return s
}

export function longestDigitRun(text: string): number {
  const runs = normalizeDigits(text).match(/\d+/g) ?? []
  return runs.reduce((m, r) => Math.max(m, r.length), 0)
}

/** A short message that is mostly digits — a piece of a number being sent in chunks. */
function digitChunk(text: string): string | null {
  const n = normalizeDigits(text)
  const digits = n.replace(/\D/g, '')
  const rest = n.replace(/[\d\s\W_]/g, '')
  return digits.length >= 1 && rest.length <= 10 ? digits : null
}

const EMAIL = /[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9-]+\s*(\.|\(dot\)|\[dot\])\s*[a-z]{2,}/i
const URL = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\.(com|in|net|org|me|io|co|app|link|ly|xyz|site|online)\b/i
const HANDLE = /(^|[\s(])@[a-z0-9_.]{3,}/i
const UPI = /\b[a-z0-9._-]{2,}@(ok\w+|ybl|ibl|axl|paytm|upi|apl|icici|sbi|hdfcbank|axisbank|kotak|yesbank)\b/i

const HINT_WORDS: Array<[RegExp, string]> = [
  [/\b(insta|instagram|ig|snap|snapchat|telegram|whatsapp|watsapp|whatsap|wtsp|facebook|fb|signal|wechat|imo|sharechat|moj|linkedin)\b/i, 'mentions an outside app'],
  [/\b(number|nmbr|no\.|mobile|phone|contact|call me|ring me|dm me|text me|mail me|email)\b/i, 'talks about contact details'],
  [/\b(gmail|yahoo|hotmail|outlook|rediff|icloud|proton)\b/i, 'mentions an email provider'],
  [/\b(upi|gpay|google pay|phonepe|paytm|bank|account no|ifsc|send money|transfer|loan|invest|investment|crypto|bitcoin|forex|trading|profit|gift card|customs|parcel|emergency money)\b/i, 'mentions money or payments'],
  [/\b(address|house name|veedu|veettil|street|lane|flat no|pin ?code)\b/i, 'mentions an address'],
  [/(\d\D{0,3}){8,}/, 'contains many numbers'],
]

export type RuleContext = {
  /** the sender's previous few messages in this conversation, oldest first (any status) */
  senderRecent: string[]
  /** true once both people have an approved contact exchange — contact rules switch off */
  contactApproved: boolean
}

export function screenRules(body: string, ctx: RuleContext): RuleResult {
  const hints: string[] = []
  for (const [re, label] of HINT_WORDS) if (re.test(body)) hints.push(label)
  const run = longestDigitRun(body)
  if (run >= 8) hints.push(`a run of ${run} digits`)

  if (ctx.contactApproved) return { block: null, hints }

  if (run >= 10) return { block: { category: 'CONTACT_INFO', reason: 'phone-number-like digit run' }, hints }
  if (EMAIL.test(body)) return { block: { category: 'CONTACT_INFO', reason: 'email address' }, hints }
  if (UPI.test(body)) return { block: { category: 'CONTACT_INFO', reason: 'UPI ID' }, hints }
  if (URL.test(body)) return { block: { category: 'CONTACT_INFO', reason: 'link / website' }, hints }
  if (HANDLE.test(body)) return { block: { category: 'CONTACT_INFO', reason: 'social media handle' }, hints }

  // a number sent in pieces across several short messages
  const chunk = digitChunk(body)
  if (chunk) {
    let joined = chunk
    for (let i = ctx.senderRecent.length - 1; i >= 0 && joined.length < 10; i--) {
      const c = digitChunk(ctx.senderRecent[i])
      if (!c) break
      joined = c + joined
    }
    if (joined.length >= 10) return { block: { category: 'CONTACT_INFO', reason: 'phone number split across messages' }, hints }
    if (joined.length > chunk.length) hints.push('continues a sequence of number-only messages')
  }
  return { block: null, hints }
}
