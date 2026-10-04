'use client'
import { useEffect, useRef, useState } from 'react'
import { api, ErrorNote, Spinner, useT } from '@/lib/client/ui.tsx'

type Photo = { id: number; is_primary: boolean; status: string; reason: string | null }

export default function PhotoManager({ onChange }: { onChange?: (approved: number) => void }) {
  const t = useT()
  const [photos, setPhotos] = useState<Photo[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const update = (p: Photo[]) => {
    setPhotos(p)
    onChange?.(p.filter((x) => x.status === 'APPROVED').length)
  }
  useEffect(() => { api<{ photos: Photo[] }>('/api/photos').then((r) => update(r.photos)).catch(() => {}) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(file: File) {
    setBusy(true); setErr(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const r = await api<{ photo: Photo; photos: Photo[] }>('/api/photos', { form })
      update(r.photos)
      if (r.photo.status === 'REJECTED') setErr(r.photo.reason)
    } catch (e) { setErr((e as Error).message) } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  async function act(id: number, what: 'primary' | 'delete') {
    setErr(null)
    try {
      const r = what === 'delete'
        ? await api<{ photos: Photo[] }>(`/api/photos/${id}`, { method: 'DELETE' })
        : await api<{ photos: Photo[] }>(`/api/photos/${id}`, { body: { action: 'primary' } })
      update(r.photos)
    } catch (e) { setErr((e as Error).message) }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {photos.map((p) => (
          <div key={p.id} className="relative aspect-[4/5] rounded-xl overflow-hidden bg-maroon-50 border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/photo/${p.id}`} alt="" className="w-full h-full object-cover" />
            <div className="absolute top-1 left-1 flex gap-1">
              {p.is_primary && <span className="chip !text-[10px]">{t('ob.photos.main')}</span>}
              {p.status === 'REVIEW' && <span className="chip !text-[10px] !bg-white">{t('ob.photos.review')}</span>}
            </div>
            <div className="absolute bottom-0 inset-x-0 flex text-[11px] font-semibold">
              {!p.is_primary && p.status === 'APPROVED' && (
                <button type="button" onClick={() => act(p.id, 'primary')} className="flex-1 bg-white/90 py-1">{t('ob.photos.makeMain')}</button>
              )}
              <button type="button" onClick={() => act(p.id, 'delete')} className="flex-1 bg-white/90 py-1 text-red-700">{t('ob.photos.remove')}</button>
            </div>
          </div>
        ))}
        {photos.length < 6 && (
          <button type="button" disabled={busy} onClick={() => input.current?.click()}
            className="aspect-[4/5] rounded-xl border-2 border-dashed border-line grid place-items-center text-sm text-muted bg-white hover:border-gold">
            {busy ? <span className="flex flex-col items-center gap-2 text-xs px-2 text-center"><Spinner />{t('ob.photos.checking')}</span> : <span className="text-center">＋<br />{t('ob.photos.add')}</span>}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <ErrorNote text={err} />
    </div>
  )
}
