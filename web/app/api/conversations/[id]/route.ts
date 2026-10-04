import { z } from 'zod'
import { handle, ok } from '@/lib/server/http.ts'
import { apiUser } from '@/lib/server/auth.ts'
import { viewConversation } from '@/lib/domain/inbox.ts'
import { listMessages, markRead, sendMessage } from '@/lib/domain/messages.ts'
import { agreeContact, closeConversation, requestContact, respond } from '@/lib/domain/conversations.ts'

type Ctx = { params: Promise<{ id: string }> }

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const u = await apiUser({ onboarded: true })
  const id = Number((await ctx.params).id)
  const after = Number(new URL(req.url).searchParams.get('after') ?? 0)
  if (after > 0) return ok({ messages: await listMessages(u, id, after) })
  return ok(await viewConversation(u, id))
})

const Action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), body: z.string() }),
  z.object({ action: z.literal('read') }),
  z.object({ action: z.literal('accept') }),
  z.object({ action: z.literal('decline') }),
  z.object({ action: z.literal('contact_request') }),
  z.object({ action: z.literal('contact_agree') }),
  z.object({ action: z.literal('contact_decline') }),
  z.object({ action: z.literal('close') }),
  z.object({ action: z.literal('block') }),
  z.object({ action: z.literal('report'), reason: z.string().min(3).max(1000) }),
])

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const id = Number((await ctx.params).id)
  const a = Action.parse(await req.json())
  // reading, closing, blocking and reporting stay possible while an account is paused
  const passive = ['read', 'close', 'block', 'report', 'decline'].includes(a.action)
  const u = await apiUser({ onboarded: true, canAct: !passive })
  switch (a.action) {
    case 'send': return ok({ message: await sendMessage(u, id, a.body) })
    case 'read': await markRead(u, id); break
    case 'accept': await respond(u, id, true); break
    case 'decline': await respond(u, id, false); break
    case 'contact_request': await requestContact(u, id); break
    case 'contact_agree': await agreeContact(u, id, true); break
    case 'contact_decline': await agreeContact(u, id, false); break
    case 'close': await closeConversation(u, id, { block: false }); break
    case 'block': await closeConversation(u, id, { block: true }); break
    case 'report': await closeConversation(u, id, { block: true, report: a.reason }); break
  }
  return ok(await viewConversation(u, id))
})
