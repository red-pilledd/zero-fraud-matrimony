'use client'
import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import { translate, type Key, type Lang } from '../i18n.ts'

// ---------- language ----------
const LangCtx = createContext<Lang>('en')
export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangCtx.Provider value={lang}>{children}</LangCtx.Provider>
}
export function useT() {
  const lang = useContext(LangCtx)
  return useCallback((k: Key) => translate(lang, k), [lang])
}
export const useLang = () => useContext(LangCtx)

// ---------- API ----------
export class ApiError extends Error {}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
    headers: opts.form ? undefined : { 'content-type': 'application/json' },
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth') && !path.startsWith('/api/admin')) {
    window.location.href = '/login'
  }
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? 'Something went wrong')
  return data as T
}

// ---------- live events (Server-Sent Events) ----------
export type LiveEvent = { type: 'hello' | 'message' | 'conversation' | 'questions' | 'account'; conversationId?: number }

export function LiveProvider() {
  useEffect(() => {
    let es: EventSource | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    const connect = () => {
      es = new EventSource('/api/stream')
      es.onmessage = (m) => {
        try {
          window.dispatchEvent(new CustomEvent<LiveEvent>('live', { detail: JSON.parse(m.data) }))
        } catch { /* ignore */ }
      }
      es.onerror = () => {
        es?.close()
        retry = setTimeout(connect, 3000)
      }
    }
    connect()
    return () => { es?.close(); if (retry) clearTimeout(retry) }
  }, [])
  return null
}

export function useLive(fn: (e: LiveEvent) => void) {
  const ref = useRef(fn)
  useEffect(() => { ref.current = fn })
  useEffect(() => {
    const h = (e: Event) => ref.current((e as CustomEvent<LiveEvent>).detail)
    window.addEventListener('live', h)
    return () => window.removeEventListener('live', h)
  }, [])
}

// ---------- small pieces ----------
export function Avatar({ photoId, blurred, name, size = 56 }: { photoId: number | null; blurred?: boolean; name: string; size?: number }) {
  return photoId ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/photo/${photoId}`} alt={name} width={size} height={size}
      className={`rounded-full object-cover bg-maroon-50 shrink-0 ${blurred ? 'blur-[2px]' : ''}`} style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full bg-maroon-100 text-maroon grid place-items-center font-semibold shrink-0" style={{ width: size, height: size }}>
      {name.slice(0, 1)}
    </div>
  )
}

export function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null
  return <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{text}</p>
}

export function Spinner() {
  return <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden />
}

export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
