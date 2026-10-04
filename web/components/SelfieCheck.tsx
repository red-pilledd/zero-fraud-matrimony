'use client'
import { useEffect, useRef, useState } from 'react'
import { api, ErrorNote, Spinner, useLang, useT } from '@/lib/client/ui.tsx'

// Live camera only — no gallery upload — with a random gesture, so an old or stolen photo can't pass.
export default function SelfieCheck({ onVerified }: { onVerified: (status: string) => void }) {
  const t = useT()
  const lang = useLang()
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [check, setCheck] = useState<{ id: number; challenge: string; challenge_ml: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<{ status: string; note: string } | null>(null)

  useEffect(() => () => stream.current?.getTracks().forEach((tr) => tr.stop()), [])

  async function start() {
    setErr(null); setResult(null)
    try {
      const c = await api<{ id: number; challenge: string; challenge_ml: string }>('/api/selfie')
      setCheck(c)
      if (!stream.current) {
        stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      }
      if (video.current) {
        video.current.srcObject = stream.current
        await video.current.play()
      }
    } catch (e) {
      setCheck(null) // no live camera → no capture button
      setErr(e instanceof DOMException ? t('ob.selfie.nocam') : (e as Error).message)
    }
  }

  async function capture() {
    const v = video.current
    if (!v || !check) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    const ctx = canvas.getContext('2d')!
    ctx.translate(canvas.width, 0) // un-mirror the preview so the saved image is how others see you
    ctx.scale(-1, 1)
    ctx.drawImage(v, 0, 0)
    const image = canvas.toDataURL('image/jpeg', 0.88)
    setBusy(true); setErr(null)
    try {
      const r = await api<{ status: string; note: string }>('/api/selfie', { body: { checkId: check.id, image } })
      setResult(r)
      if (r.status === 'VERIFIED' || r.status === 'REVIEW') {
        stream.current?.getTracks().forEach((tr) => tr.stop())
        stream.current = null
        setTimeout(() => onVerified(r.status), 1200)
      } else {
        setCheck(null)
      }
    } catch (e) { setErr((e as Error).message); setCheck(null) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-[3/4] max-w-xs mx-auto rounded-2xl overflow-hidden bg-ink">
        {/* transparent poster: Android WebView otherwise paints a grey play-button placeholder */}
        <video ref={video} playsInline muted className="w-full h-full object-cover -scale-x-100"
          poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" />
        {!check && !result && (
          <div className="absolute inset-0 grid place-items-center text-white/70 text-sm p-6 text-center">📷</div>
        )}
        {check && (
          <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/70 to-transparent p-4 text-white">
            <div className="text-xs uppercase tracking-wide opacity-80">{t('ob.selfie.do')}</div>
            <div className="font-semibold text-lg leading-snug">{lang === 'ml' ? check.challenge_ml : check.challenge}</div>
          </div>
        )}
      </div>
      {result && (
        <p className={`text-sm rounded-xl px-3 py-2 ${result.status === 'REJECTED' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{result.note}</p>
      )}
      <ErrorNote text={err} />
      {!check ? (
        <button className="btn btn-primary w-full" onClick={start}>{result ? t('ob.selfie.again') : t('ob.selfie.start')}</button>
      ) : (
        <button className="btn btn-gold w-full" onClick={capture} disabled={busy}>
          {busy ? <><Spinner /> {t('ob.selfie.checking')}</> : t('ob.selfie.capture')}
        </button>
      )}
    </div>
  )
}
