import 'server-only'
import webpush from 'web-push'
import { q } from './db.ts'
import { isOnline } from './bus.ts'
import { getSettings } from './settings.ts'

let configured = false
function configure(): boolean {
  if (configured) return true
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com', pub, priv)
  configured = true
  return true
}

/**
 * Phone notification. Deliberately says nothing about who or what — a parent glancing at the
 * lock screen sees only "New activity on Thuna". Skipped while the app is open (the live stream covers it).
 */
export async function notify(userId: number, opts: { url: string; force?: boolean } ) {
  if (!configure()) return
  if (!opts.force && isOnline(userId)) return
  const subs = await q<{ id: number; endpoint: string; p256dh: string; auth: string }>(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1', [userId])
  if (!subs.length) return
  const { brand_name } = await getSettings()
  const payload = JSON.stringify({ title: brand_name, body: `New activity on ${brand_name}`, url: opts.url })
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 })
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await q('DELETE FROM push_subscriptions WHERE id = $1', [s.id])
    }
  }))
}
