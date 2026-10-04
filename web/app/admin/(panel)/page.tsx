import { q, q0 } from '@/lib/server/db.ts'
import { getSettings, rupees } from '@/lib/server/settings.ts'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const s = await getSettings()
  const m = await q0<Record<string, string>>(`SELECT
      COUNT(*) FILTER (WHERE status <> 'DELETED') AS members,
      COUNT(*) FILTER (WHERE onboarding_step = 'DONE' AND status = 'ACTIVE') AS live,
      COUNT(*) FILTER (WHERE selfie_status = 'VERIFIED') AS verified,
      COUNT(*) FILTER (WHERE status = 'FROZEN') AS frozen,
      COUNT(*) FILTER (WHERE status = 'BANNED') AS banned,
      COUNT(*) FILTER (WHERE created_at > now() - interval '1 day') AS new_today
    FROM users`)
  const pools = await q<{ pool: string; created_by: string; n: string }>(
    `SELECT COALESCE(pool,'—') AS pool, created_by, COUNT(*) AS n FROM users WHERE onboarding_step = 'DONE' AND status = 'ACTIVE' GROUP BY 1,2 ORDER BY 1,2`)
  const msgs = await q0<Record<string, string>>(`SELECT
      COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
      COUNT(*) FILTER (WHERE status = 'BLOCKED') AS blocked,
      COUNT(*) FILTER (WHERE status = 'PENDING') AS pending
    FROM messages WHERE created_at > now() - interval '1 day'`)
  const blockedBy = await q<{ category: string; n: string }>(
    `SELECT category, COUNT(*) AS n FROM messages WHERE status = 'BLOCKED' AND created_at > now() - interval '7 days' GROUP BY 1 ORDER BY 2 DESC`)
  const money = await q0<Record<string, string>>(`SELECT
      (SELECT COALESCE(SUM(amount_paise),0) FROM payments WHERE status = 'PAID' AND provider = 'RAZORPAY') AS gateway,
      (SELECT COALESCE(SUM(amount_paise),0) FROM payments WHERE status = 'PAID' AND provider = 'TEST') AS test,
      (SELECT COALESCE(SUM(credit_paise),0) FROM users) AS credit_outstanding,
      (SELECT COALESCE(-SUM(delta_paise),0) FROM credit_ledger WHERE reason = 'SPENT') AS credit_spent,
      (SELECT COUNT(*) FROM conversations) AS conversations,
      (SELECT COUNT(*) FROM conversations WHERE status = 'ACTIVE') AS active,
      (SELECT COUNT(*) FROM conversations WHERE contact_state = 'APPROVED') AS exchanged,
      (SELECT COUNT(*) FROM conversations WHERE refunded) AS refunded`)
  const ai = await q<{ task: string; calls: string; usd: string; ms: string; fails: string }>(
    `SELECT task, COUNT(*) AS calls, COALESCE(SUM(cost_usd),0) AS usd, COALESCE(AVG(ms),0) AS ms, COUNT(*) FILTER (WHERE NOT ok) AS fails
       FROM ai_usage WHERE created_at > now() - interval '30 days' GROUP BY task ORDER BY task`)
  const aiToday = Number((await q0<{ usd: string }>(`SELECT COALESCE(SUM(cost_usd),0) AS usd FROM ai_usage WHERE created_at > now() - interval '1 day'`))?.usd ?? 0)
  const inr = (usd: number) => `₹${(usd * s.usd_inr).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  const totalUsd = ai.reduce((a, r) => a + Number(r.usd), 0)
  const delivered30 = Number((await q0<{ n: string }>(`SELECT COUNT(*) AS n FROM messages WHERE status <> 'PENDING' AND created_at > now() - interval '30 days'`))?.n ?? 0)
  const screenUsd = Number(ai.find((r) => r.task === 'screen')?.usd ?? 0)

  const Stat = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
    <div className="card p-4"><div className="text-xs text-muted">{label}</div><div className="text-2xl font-semibold mt-1">{value}</div>{sub && <div className="text-xs text-muted mt-1">{sub}</div>}</div>
  )

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Stat label="Members" value={m?.members ?? 0} sub={`${m?.new_today} new today`} />
        <Stat label="Live profiles" value={m?.live ?? 0} />
        <Stat label="Selfie verified" value={m?.verified ?? 0} />
        <Stat label="Paused" value={m?.frozen ?? 0} />
        <Stat label="Banned" value={m?.banned ?? 0} />
        <Stat label="Conversations" value={money?.conversations ?? 0} sub={`${money?.active} active · ${money?.exchanged} exchanged numbers`} />
      </section>

      <section className="grid md:grid-cols-3 gap-3">
        <div className="card p-4">
          <h2 className="font-semibold mb-2">Sections (hidden routing)</h2>
          <table className="w-full text-sm"><tbody>
            {pools.map((p) => <tr key={p.pool + p.created_by} className="border-t border-line"><td className="py-1">{p.pool}</td><td className="text-muted">{p.created_by}</td><td className="text-right">{p.n}</td></tr>)}
          </tbody></table>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold mb-2">Messages (24 h)</h2>
          <p className="text-sm">Delivered <b>{msgs?.delivered}</b> · Blocked <b className="text-red-700">{msgs?.blocked}</b> · Waiting for AI <b>{msgs?.pending}</b></p>
          <h3 className="text-xs text-muted mt-3 mb-1">Blocked by reason (7 days)</h3>
          <ul className="text-sm">{blockedBy.map((b) => <li key={b.category} className="flex justify-between"><span>{b.category}</span><span>{b.n}</span></li>)}</ul>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold mb-2">Money</h2>
          <ul className="text-sm space-y-1">
            <li className="flex justify-between"><span>Collected (Razorpay)</span><b>{rupees(Number(money?.gateway ?? 0))}</b></li>
            <li className="flex justify-between text-muted"><span>Test payments</span><span>{rupees(Number(money?.test ?? 0))}</span></li>
            <li className="flex justify-between"><span>Credit spent on chats</span><span>{rupees(Number(money?.credit_spent ?? 0))}</span></li>
            <li className="flex justify-between"><span>Credit owed to members</span><span>{rupees(Number(money?.credit_outstanding ?? 0))}</span></li>
            <li className="flex justify-between"><span>Requests refunded</span><span>{money?.refunded}</span></li>
          </ul>
        </div>
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap justify-between gap-2 mb-2">
          <h2 className="font-semibold">AI cost (30 days)</h2>
          <div className="text-sm">Today <b>{inr(aiToday)}</b> · 30 days <b>{inr(totalUsd)}</b>
            {delivered30 > 0 && <> · per message screened <b>{inr(screenUsd / delivered30)}</b></>}</div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-muted text-xs"><tr><th className="py-1">Job</th><th>Model</th><th className="text-right">Calls</th><th className="text-right">Avg time</th><th className="text-right">Failures</th><th className="text-right">Cost</th></tr></thead>
          <tbody>{ai.map((r) => (
            <tr key={r.task} className="border-t border-line">
              <td className="py-1">{r.task}</td><td className="text-muted">{s.ai[r.task as 'screen']?.model}</td><td className="text-right">{r.calls}</td>
              <td className="text-right">{(Number(r.ms) / 1000).toFixed(1)} s</td><td className="text-right">{r.fails}</td><td className="text-right">{inr(Number(r.usd))}</td>
            </tr>))}</tbody>
        </table>
      </section>
    </div>
  )
}
