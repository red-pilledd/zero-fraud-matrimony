import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['pg', 'bcryptjs', 'sharp', 'web-push'],
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'same-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
      ],
    }]
  },
}

export default nextConfig
