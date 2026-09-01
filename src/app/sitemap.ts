import type { MetadataRoute } from 'next'
import {
  productPages,
  featurePages,
  industryPages,
  servicePages,
  serviceArticlePages,
  companyPages,
  legalPages,
  resourcePages,
} from '@/lib/footer-pages'

// Marketing/root-domain content only — tenant app routes (/dashboard, /pos, etc.),
// the customer widget, and the booking/portal apps are excluded: they're
// functional pages behind auth or a tenant subdomain, not indexable content.
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'repairbooking.co.uk'
const BASE_URL = `https://${ROOT_DOMAIN}`

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE_URL}/features`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/industries`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/services`, changeFrequency: 'weekly', priority: 0.8 },
  ]

  const dynamicRoutes: MetadataRoute.Sitemap = [
    ...productPages.map((p) => ({
      url: `${BASE_URL}/product/${p.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...featurePages.map((p) => ({
      url: `${BASE_URL}/features/${p.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...industryPages.map((p) => ({
      url: `${BASE_URL}/industries/${p.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...servicePages.map((p) => ({
      url: `${BASE_URL}/services/${p.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...serviceArticlePages.map((p) => ({
      url: `${BASE_URL}/services/${p.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...companyPages.map((p) => ({
      url: `${BASE_URL}/company/${p.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
    ...legalPages.map((p) => ({
      url: `${BASE_URL}/company/${p.slug}`,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
    ...resourcePages.map((p) => ({
      url: `${BASE_URL}/resources/${p.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ]

  return [...staticRoutes, ...dynamicRoutes]
}
