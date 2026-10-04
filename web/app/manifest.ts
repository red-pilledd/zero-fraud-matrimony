import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Thuna'
  return {
    name: `${name} — Verified Kerala Matrimony`,
    short_name: name,
    start_url: '/discover',
    display: 'standalone',
    background_color: '#fbf6ee',
    theme_color: '#7b1e3a',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
