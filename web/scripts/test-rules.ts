import { screenRules, normalizeDigits } from '../lib/moderation/rules.ts'
const ctx = { senderRecent: [] as string[], contactApproved: false }
const cases: Array<[string, boolean, string[]?]> = [
  ['my number is 98470 12345', true],
  ['nine eight four seven zero one two three four five', true],
  ['ombathu ettu naalu ezhu poojyam onnu randu moonu naalu anju', true],
  ['൯൮൪൭൦൧൨൩൪൫', true],
  ['double nine 8 4 7 . 0 1 2 - 3 4', true],
  ['mail me at shibin(at)gmail(dot)com', true],
  ['find me @shibin_kollam', true],
  ['pay to abc@okaxis', true],
  ['see www.example.com', true],
  ['my income is 15,00,000 per year and height 5.8', false],
  ['I was born in 1995, family of 4', false],
  ['ente veedu kollam aanu, onnu parayu', false],
  ['what time? 9:30 is fine', false],
  ['5 4 3', true, ['9847', '01', '2']],
]
let bad = 0
for (const [msg, expect, recent] of cases) {
  const r = screenRules(msg, { ...ctx, senderRecent: recent ?? [] })
  const got = !!r.block
  if (got !== expect) bad++
  console.log(got === expect ? 'PASS' : 'FAIL', JSON.stringify(msg), '->', r.block?.reason ?? 'allow', '| hints:', r.hints.join('; '), '| norm:', normalizeDigits(msg))
}
console.log(bad ? `${bad} FAILED` : 'all passed')
