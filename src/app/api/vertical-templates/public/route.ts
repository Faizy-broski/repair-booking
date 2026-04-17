import { NextResponse } from 'next/server'
import { VerticalTemplateService } from '@/backend/services/vertical-template.service'

/**
 * GET /api/vertical-templates/public
 *
 * Public (no-auth) endpoint that returns active vertical templates.
 * Used by the registration flow and settings preview — no session required.
 *
 * Optimisation: Next.js caches the response at the edge for 5 minutes.
 * Templates change rarely (superadmin edits), so all registration page
 * visitors share one warm cache entry instead of each hitting the DB.
 */
export async function GET() {
  try {
    const templates = await VerticalTemplateService.list(true) // activeOnly = true
    return NextResponse.json(
      { data: templates },
      {
        status: 200,
        headers: {
          // Edge / CDN cache: 5 min fresh, 1 hr stale-while-revalidate
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        },
      }
    )
  } catch {
    return NextResponse.json({ data: [] }, { status: 200 })
  }
}
