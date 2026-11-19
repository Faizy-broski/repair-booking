import type { NextConfig } from 'next'

const CSP = [
  "default-src 'self'",
  // 'unsafe-inline' is required by Next's inline bootstrap scripts and the gtag init snippet.
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://*.doubleclick.net https://*.supabase.co wss://*.supabase.co",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
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
          // CSP ships Report-Only first so nothing breaks; check the browser console for
          // violations, then rename to 'Content-Security-Policy' to enforce.
          { key: 'Content-Security-Policy-Report-Only', value: CSP },
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
