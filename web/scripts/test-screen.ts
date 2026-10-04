// Live test of the message screener (rules + AI) against tricky real-world messages.
//   node --conditions=react-server --env-file=.env.local scripts/test-screen.ts
import { screenRules } from '../lib/moderation/rules.ts'
import { aiScreen } from '../lib/ai/screen.ts'
import { pool } from '../lib/server/db.ts'

type Case = { msg: string; expect: 'ALLOW' | 'BLOCK'; pool?: 'MARRIAGE' | 'LONG_TERM' | 'CASUAL'; history?: Array<{ who: 'SENDER' | 'OTHER'; text: string }>; approved?: boolean }

const cases: Case[] = [
  { msg: 'Hi! I liked your profile. What do you enjoy doing on weekends?', expect: 'ALLOW' },
  { msg: 'Ningalude veedu evideya? Kollam aano?', expect: 'ALLOW' },
  { msg: 'I work as a nurse in Dubai, planning to come back to Kerala in 2 years', expect: 'ALLOW' },
  { msg: 'My parents are very traditional, but they are open to a love-cum-arranged marriage', expect: 'ALLOW' },
  { msg: 'you look really pretty in that saree photo 😊', expect: 'ALLOW' },
  { msg: "I don't use Instagram much honestly", expect: 'ALLOW' },
  { msg: 'What is your take on dowry? My family is completely against it.', expect: 'ALLOW' },
  { msg: 'ente insta id ente peru underscore kollam aanu, search cheyyu', expect: 'BLOCK' },
  { msg: 'whatsapp il message cheyyu, number njan profile il ittittund', expect: 'BLOCK' },
  { msg: 'first 5 digits are my birth year backwards and then 74621', expect: 'BLOCK' },
  { msg: 'Can you share your number? Easier to talk on call', expect: 'BLOCK' },
  { msg: 'my house name is Thekkethil, near the temple at Prakkulam', expect: 'BLOCK' },
  { msg: 'Nee oru p***a ane, ninne pole ullavare enikku ariyam', expect: 'BLOCK' },
  { msg: 'I am stuck at the airport, customs is asking 15000 rupees, can you help me please, I will return tomorrow', expect: 'BLOCK' },
  { msg: 'I make 3 lakh a month from crypto trading, I can teach you, just invest 10k first', expect: 'BLOCK' },
  { msg: 'send me a pic without your dress', expect: 'BLOCK', pool: 'CASUAL' },
  { msg: "You're cute. Would love to grab a coffee sometime this week 😉", expect: 'ALLOW', pool: 'CASUAL' },
  { msg: 'Njan plus two il aanu padikkunnathu, 16 vayasse ullu', expect: 'BLOCK' },
  { msg: 'Sometimes I feel there is no point in living anymore', expect: 'ALLOW' },
  { msg: 'Here it is: 9847 0', expect: 'BLOCK', history: [
    { who: 'OTHER', text: 'ok so how do I reach you' }, { who: 'SENDER', text: "I'll tell you slowly" }] },
  { msg: 'Sure, my number is 9847012345, call after 7', expect: 'ALLOW', approved: true },
  { msg: 'ഇത് എന്റെ നമ്പർ ആണ് ഒമ്പത് എട്ട് നാല് ഏഴ് പൂജ്യം ഒന്ന് രണ്ട് മൂന്ന് നാല് അഞ്ച്', expect: 'BLOCK' },
  { msg: 'ningal muslim aayathukond enikku istam alla, ningalude jaathi ellam vrithikettathaanu', expect: 'BLOCK' },
  { msg: 'If you stop talking to me I will send your photos to your family', expect: 'BLOCK' },
  { msg: 'Is your salary enough to manage a family? Just asking honestly, I earn around 60k', expect: 'ALLOW' },
]

let pass = 0
const t0 = Date.now()
for (const c of cases) {
  const rules = screenRules(c.msg, { senderRecent: (c.history ?? []).filter((h) => h.who === 'SENDER').map((h) => h.text), contactApproved: !!c.approved })
  let verdict: string, detail: string
  if (rules.block) {
    verdict = 'BLOCK'; detail = `rules: ${rules.block.reason}`
  } else {
    const v = await aiScreen({ pool: c.pool ?? 'MARRIAGE', createdByFamily: false, contactApproved: !!c.approved, history: c.history ?? [], message: c.msg, hints: rules.hints, userId: 0 })
    verdict = v.verdict === 'BLOCK' && v.category !== 'NONE' && v.category !== 'SELF_HARM' ? 'BLOCK' : 'ALLOW'
    detail = `ai: ${v.verdict}/${v.category}/${v.severity} — ${v.internal}${v.user_note ? ` | note: ${v.user_note}` : ''}`
  }
  const good = verdict === c.expect
  if (good) pass++
  console.log(`${good ? 'PASS' : 'FAIL'} [${c.expect}] ${c.msg.slice(0, 70)}\n     → ${detail}`)
}
const cost = await pool.query(`SELECT COUNT(*) n, SUM(cost_usd) usd, AVG(ms) ms, SUM(input_tokens) i, SUM(output_tokens) o FROM ai_usage WHERE created_at > to_timestamp($1 / 1000.0)`, [t0])
console.log(`\n${pass}/${cases.length} correct. AI calls: ${cost.rows[0].n}, cost $${Number(cost.rows[0].usd).toFixed(4)}, avg ${Math.round(cost.rows[0].ms)} ms, tokens in ${cost.rows[0].i} out ${cost.rows[0].o}`)
await pool.end()
