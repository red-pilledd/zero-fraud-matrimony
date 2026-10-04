import 'server-only'
import { q, q0 } from '../server/db.ts'
import { DomainError } from '../pg.ts'
import { ageFrom, type User } from '../types.ts'
import { pickNote, type Conversation } from './conversations.ts'
import { listMessages, type MessageRow } from './messages.ts'

export type Person = { id: number; display_name: string; age: number | null; district: string | null; photo_id: number | null; photo_blurred: boolean }

export type InboxItem = {
  id: number; status: Conversation['status']; mine: boolean; intro: string; expires_at: string; created_at: string
  last_msg_at: string | null; unread: number; last: string | null; contact_state: Conversation['contact_state']
  closed_reason: string | null; refunded: boolean; price_paise: number; person: Person
}

type Joined = Conversation & {
  o_id: number; o_name: string | null; o_dob: string | null; o_district: string | null; o_vis: string; o_photo: number | null
  unread: string; last: string | null
}

export async function listInbox(me: User): Promise<InboxItem[]> {
  const rows = await q<Joined>(
    `SELECT c.*, o.id AS o_id, o.display_name AS o_name, o.dob AS o_dob, o.district AS o_district, o.photo_visibility AS o_vis,
            (SELECT p.id FROM photos p WHERE p.user_id = o.id AND p.status = 'APPROVED' ORDER BY p.is_primary DESC, p.id LIMIT 1) AS o_photo,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id <> $1 AND m.status = 'DELIVERED' AND m.read_at IS NULL) AS unread,
            (SELECT m.body FROM messages m WHERE m.conversation_id = c.id AND (m.status = 'DELIVERED' OR m.sender_id = $1) ORDER BY m.id DESC LIMIT 1) AS last
       FROM conversations c
       JOIN users o ON o.id = CASE WHEN c.initiator_id = $1 THEN c.recipient_id ELSE c.initiator_id END
      WHERE (c.initiator_id = $1 OR c.recipient_id = $1)
      ORDER BY COALESCE(c.last_msg_at, c.created_at) DESC LIMIT 300`, [me.id])
  return rows.map((r) => ({
    id: r.id, status: r.status, mine: r.initiator_id === me.id, intro: r.intro, expires_at: r.expires_at, created_at: r.created_at,
    last_msg_at: r.last_msg_at, unread: Number(r.unread), last: r.last, contact_state: r.contact_state, closed_reason: r.closed_reason,
    refunded: r.refunded, price_paise: r.price_paise,
    person: {
      id: r.o_id, display_name: r.o_name ?? 'Member', age: ageFrom(r.o_dob), district: r.o_district, photo_id: r.o_photo,
      photo_blurred: r.o_vis === 'ACCEPTED' && r.status !== 'ACTIVE',
    },
  }))
}

export type ConversationView = {
  conversation: Pick<Conversation, 'id' | 'status' | 'intro' | 'expires_at' | 'contact_state' | 'contact_note' | 'contact_retry_after' | 'closed_reason' | 'created_at'>
    & { mine: boolean; contact_requested_by_me: boolean | null }
  person: Person
  otherPhone: string | null
  messages: MessageRow[]
  me: number
}

export async function viewConversation(me: User, id: number): Promise<ConversationView> {
  const c = await q0<Conversation>('SELECT * FROM conversations WHERE id = $1 AND (initiator_id = $2 OR recipient_id = $2)', [id, me.id])
  if (!c) throw new DomainError('Conversation not found')
  const otherId = c.initiator_id === me.id ? c.recipient_id : c.initiator_id
  const o = (await q0<User & { photo_id: number | null }>(
    `SELECT u.*, (SELECT p.id FROM photos p WHERE p.user_id = u.id AND p.status = 'APPROVED' ORDER BY p.is_primary DESC, p.id LIMIT 1) AS photo_id
       FROM users u WHERE u.id = $1`, [otherId]))!
  return {
    conversation: {
      id: c.id, status: c.status, intro: c.intro, expires_at: c.expires_at, contact_state: c.contact_state, contact_note: pickNote(c.contact_note, me.lang),
      contact_retry_after: c.contact_retry_after, closed_reason: c.closed_reason, created_at: c.created_at,
      mine: c.initiator_id === me.id,
      contact_requested_by_me: c.contact_requested_by === null ? null : c.contact_requested_by === me.id,
    },
    person: {
      id: o.id, display_name: o.display_name ?? 'Member', age: ageFrom(o.dob), district: o.district, photo_id: o.photo_id,
      photo_blurred: o.photo_visibility === 'ACCEPTED' && c.status !== 'ACTIVE',
    },
    // the phone number is only ever revealed after BOTH agreed AND the review approved, while the chat is active
    otherPhone: c.contact_state === 'APPROVED' && c.status === 'ACTIVE' && o.status === 'ACTIVE' ? o.phone : null,
    messages: await listMessages(me, id),
    me: me.id,
  }
}
