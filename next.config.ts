import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  serverActions: {
    bodySizeLimit: '10mb',
  },
  // Allow images from any HTTPS host.
  // Product/brand/model images are user-supplied URLs — we can't enumerate all origins.
  // Supabase storage images still go through Next.js optimization (WebP, resizing, lazy).
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
        ],
      },
    ]
  },

  // Silence the @react-pdf/renderer canvas peer dep warning
  serverExternalPackages: ['@react-pdf/renderer', 'canvas'],

  // Turbopack: silence the webpack-config-present error
  turbopack: {},
}

export default nextConfig
