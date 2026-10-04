import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/server/auth.ts'
import { viewProfile } from '@/lib/domain/discover.ts'
import { getSettings } from '@/lib/server/settings.ts'
import { gatewayMode } from '@/lib/payments/gateway.ts'
import { translate, type Key } from '@/lib/i18n.ts'
import StartConversation from './StartConversation.tsx'

export default async function Profile({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser()
  const id = Number((await params).id)
  let p
  try { p = await viewProfile(me, id) } catch { notFound() }
  const s = await getSettings()
  const t = (k: Key) => translate(me.lang, k)
  const price = s.price_paise[me.pool!]
  const rows: Array<[string, string | number | null]> = [
    [t('f.marital_status'), p.marital_status ? t(`f.${p.marital_status}` as Key) : null],
    [t('f.height_cm'), p.height_cm ? `${p.height_cm} cm` : null],
    [t('f.district'), p.district], [t('f.mother_tongue'), p.mother_tongue], [t('f.religion'), p.religion], [t('f.caste'), p.caste],
    [t('f.education'), p.education], [t('f.occupation'), p.occupation], [t('f.income_band'), p.income_band],
    [t('f.diet'), p.diet], [t('f.drinks'), p.drinks], [t('f.smokes'), p.smokes],
  ]

  return (
    <main className="max-w-lg mx-auto pb-6">
      <div className="relative">
        <div className="flex overflow-x-auto snap-x snap-mandatory bg-maroon-50">
          {p.photos.length ? p.photos.map((ph) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={ph.id} src={`/api/photo/${ph.id}`} alt={p.display_name} className="w-full shrink-0 snap-center aspect-[4/5] object-cover" />
          )) : <div className="w-full aspect-[4/5]" />}
        </div>
        <Link href="/discover" className="absolute top-3 left-3 btn btn-ghost !py-1.5 !px-3 text-sm">← {t('common.back')}</Link>
        {p.photos.length > 1 && <span className="chip absolute top-4 right-3 !bg-white/90">{p.photos.length} 📷</span>}
      </div>
      <div className="px-4 -mt-6 relative">
        <div className="card p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-2xl font-semibold">{p.display_name}{p.age ? `, ${p.age}` : ''}</h1>
              <div className="text-sm text-muted">{[p.occupation, p.district].filter(Boolean).join(' · ')}</div>
            </div>
            <span className="chip">✓ {t('common.verified')}</span>
          </div>
          {p.photo_blurred && <p className="text-xs text-muted mt-2">🔒 {t('prof.photosHidden')}</p>}
          {p.created_by !== 'SELF' && <p className="text-xs text-muted mt-1">{t('disc.byFamily')}</p>}
          {p.about && (<>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mt-5 mb-1">{t('prof.about')}</h2>
            <p className="text-[15px] leading-relaxed whitespace-pre-line">{p.about}</p>
          </>)}
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mt-5 mb-2">{t('prof.details')}</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {rows.filter(([, v]) => v).map(([k, v]) => (
              <div key={k}><dt className="text-muted text-xs">{k}</dt><dd className="font-medium">{v}</dd></div>
            ))}
          </dl>
        </div>

        <div className="mt-4">
          {p.id === me.id ? null : p.conversation ? (
            <div className="card p-5 text-center">
              {p.conversation.status === 'ACTIVE' ? (
                <Link href={`/chat/${p.conversation.id}`} className="btn btn-primary w-full">{t('prof.goChat')}</Link>
              ) : p.conversation.status === 'REQUESTED' ? (
                <Link href={p.conversation.initiator_id === me.id ? `/chat/${p.conversation.id}` : '/inbox'} className="text-sm text-muted">{t('prof.waiting')}</Link>
              ) : <p className="text-sm text-muted">{t('prof.ended')}</p>}
            </div>
          ) : (
            <StartConversation recipientId={p.id} name={p.display_name} price={price} credit={me.credit_paise}
              mode={gatewayMode()} canStart={me.selfie_status === 'VERIFIED'} />
          )}
        </div>
      </div>
    </main>
  )
}
