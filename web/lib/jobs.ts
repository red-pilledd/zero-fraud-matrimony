import 'server-only'
import { q } from './server/db.ts'
import { expireRequests, reviewContact } from './domain/conversations.ts'
import { screenMessage } from './domain/messages.ts'

// Background work, run every 30 s inside the server process:
//  - unanswered requests past their window → refunded as credit
//  - messages still PENDING (AI was unreachable) → screened again
//  - contact reviews interrupted mid-way → run again

let running = false

export async function tick() {
  if (running) return
  running = true
  try {
    const expired = await expireRequests()
    if (expired) console.log(`[jobs] expired ${expired} request(s) and refunded credit`)
    const pending = await q<{ id: number }>(
      `SELECT id FROM messages WHERE status = 'PENDING' AND created_at < now() - interval '10 seconds' ORDER BY id LIMIT 50`)
    for (const m of pending) await screenMessage(m.id).catch((e) => console.error('[jobs] screen', m.id, e.message))
    const stuck = await q<{ id: number }>(
      `SELECT id FROM conversations WHERE contact_state = 'AI_REVIEW' AND contact_review_started < now() - interval '2 minutes' LIMIT 20`)
    for (const c of stuck) await reviewContact(c.id).catch((e) => console.error('[jobs] contact', c.id, e.message))
  } catch (err) {
    console.error('[jobs]', (err as Error).message)
  } finally {
    running = false
  }
}

declare global {
  var __thunaJobs: NodeJS.Timeout | undefined
}

export function startJobs() {
  if (globalThis.__thunaJobs) return
  globalThis.__thunaJobs = setInterval(tick, 30_000)
  setTimeout(tick, 5_000)
  console.log('[jobs] started')
}
