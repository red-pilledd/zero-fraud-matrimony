import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/server/auth.ts'
import { getSettings, rupees } from '@/lib/server/settings.ts'

// Public face: matrimony only. Nothing here mentions any other section.
export default async function Home() {
  const u = await getUser()
  if (u) redirect(u.onboarding_step === 'DONE' ? '/discover' : '/onboarding')
  const s = await getSettings()
  const price = rupees(s.price_paise.MARRIAGE)

  const pillars = [
    { t: 'Every member is real', d: 'Each profile passes a live selfie check with a random gesture, matched against their photos. No fake profiles, no agents.' },
    { t: 'Every message is checked', d: 'Our AI reads each message before it is delivered. Abuse, vulgarity, money requests and scams never reach you.' },
    { t: 'Your number stays private', d: 'Phone numbers and social media IDs cannot be shared until both of you agree and the conversation shows it is safe.' },
    { t: `Pay ${price} only to start a talk`, d: 'No premium plans, no subscriptions. One small fee opens one conversation. No reply in 48 hours? It comes back as credit.' },
  ]

  return (
    <main className="min-h-dvh flex flex-col">
      <header className="px-5 pt-6 pb-4 flex items-center justify-between max-w-5xl w-full mx-auto">
        <div className="font-serif text-2xl font-bold text-maroon">{s.brand_name}</div>
        <Link href="/login" className="btn btn-ghost !py-2">Sign in</Link>
      </header>

      <section className="px-5 max-w-5xl w-full mx-auto grid md:grid-cols-2 gap-10 items-center py-8 md:py-16">
        <div>
          <p className="chip mb-4">Kerala matrimony · ജീവിതത്തുണ</p>
          <h1 className="font-serif text-4xl md:text-5xl font-bold leading-tight text-ink">
            A life partner,<br />without the fakes.
          </h1>
          <p className="mt-4 text-lg text-muted max-w-md">
            Verified people. Conversations kept safe and respectful by AI. No premium plans — pay only when you want to talk to someone.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="btn btn-primary text-base px-6">Create a free profile</Link>
            <Link href="/login" className="btn btn-ghost text-base">For parents & family</Link>
          </div>
          <p className="mt-4 text-sm text-muted">Creating a profile and receiving messages is always free.</p>
        </div>
        <div className="card p-6 md:p-8 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gold" />
          <div className="space-y-5">
            {pillars.map((p) => (
              <div key={p.t} className="flex gap-3">
                <div className="mt-1 w-6 h-6 rounded-full bg-maroon text-white grid place-items-center text-xs shrink-0">✓</div>
                <div>
                  <div className="font-semibold">{p.t}</div>
                  <div className="text-sm text-muted mt-0.5">{p.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 max-w-5xl w-full mx-auto pb-12">
        <h2 className="font-serif text-2xl font-bold mb-4">How it works</h2>
        <ol className="grid md:grid-cols-4 gap-4">
          {[
            ['Sign up', 'With your mobile number — or a parent can create the profile.'],
            ['A short chat', 'Instead of a long form, our assistant asks a few questions and writes your profile.'],
            ['Verify', 'Add photos and take a quick live selfie.'],
            ['Talk', `Found someone? ${price} opens the conversation. Exchange numbers when you are both ready.`],
          ].map(([t, d], i) => (
            <li key={t} className="card p-5">
              <div className="text-gold font-serif text-3xl font-bold">{i + 1}</div>
              <div className="font-semibold mt-1">{t}</div>
              <div className="text-sm text-muted mt-1">{d}</div>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-auto border-t border-line px-5 py-6 text-sm text-muted">
        <div className="max-w-5xl mx-auto flex flex-wrap justify-between gap-2">
          <span>© {new Date().getFullYear()} {s.brand_name}</span>
          <span>Designed by <a href="https://indus-labs.com" className="text-maroon font-medium">IndusLabs</a></span>
        </div>
      </footer>
    </main>
  )
}
