import { getUser } from '@/lib/server/auth.ts'
import { subscribe } from '@/lib/server/bus.ts'

export const dynamic = 'force-dynamic'

// Live updates over Server-Sent Events. Events only say "something changed in conversation X";
// the page then re-fetches through the normal authorised API, so no message text travels here.
export async function GET(req: Request) {
  const u = await getUser()
  if (!u || u.status === 'BANNED') return new Response('unauthorised', { status: 401 })
  const enc = new TextEncoder()
  let cleanup = () => {}
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch { cleanup() }
      }
      send({ type: 'hello' })
      const unsub = subscribe(u.id, send)
      const ping = setInterval(() => {
        try { controller.enqueue(enc.encode(': ping\n\n')) } catch { cleanup() }
      }, 25_000)
      cleanup = () => { clearInterval(ping); unsub() }
      req.signal.addEventListener('abort', () => { cleanup(); try { controller.close() } catch {} })
    },
    cancel() { cleanup() },
  })
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' },
  })
}
