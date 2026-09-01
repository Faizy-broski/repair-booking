import type { MetadataRoute } from 'next'

// Note: Cloudflare's "Content Signals" managed block is currently appended to
// whatever robots.txt the origin serves (the BEGIN/END Cloudflare Managed
// content markers seen on the live site) — that AI-bot policy is controlled
// in the Cloudflare dashboard, not here. This file only owns the crawl rules
// and sitemap pointer for the origin itself.
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'repairbooking.co.uk'
const BASE_URL = `https://${ROOT_DOMAIN}`

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard',
          '/repairs',
          '/pos',
          '/customers',
          '/inventory',
          '/employees',
          '/reports',
          '/invoices',
          '/appointments',
          '/messages',
          '/expenses',
          '/gift-cards',
          '/settings',
          '/phone',
          '/google-reviews',
          '/account',
          '/superadmin',
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
          '/widget/',
          '/portal/',
          '/book/',
          '/s/',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
