import type { Metadata, Viewport } from 'next'
import { Inter, Noto_Sans_Malayalam, Playfair_Display } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const ml = Noto_Sans_Malayalam({ subsets: ['malayalam'], variable: '--font-ml', display: 'swap' })
const serif = Playfair_Display({ subsets: ['latin'], variable: '--font-serif', display: 'swap' })

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Thuna'

export const metadata: Metadata = {
  title: { default: `${BRAND} — Verified Kerala Matrimony`, template: `%s · ${BRAND}` },
  description: 'Every member selfie-verified. Every message checked for safety. Pay only for the conversations you start — no premium plans.',
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
  appleWebApp: { capable: true, title: BRAND, statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: '#7b1e3a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${ml.variable} ${serif.variable}`}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  )
}
