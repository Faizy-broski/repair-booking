// GET /s/{code} — public short-link redirect (WhatsApp/email invoice links).
// No auth, no tenant resolution — deliberately outside (tenant)/api tree and
// listed in middleware.ts's PUBLIC_PATHS so it works from any subdomain.
import { NextRequest, NextResponse } from 'next/server'
import { rateLimitMiddleware } from '@/backend/middleware/rate-limit.middleware'
import { ShortLinkService } from '@/backend/services/short-link.service'

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const rateLimited = await rateLimitMiddleware(request, { limit: 60, windowMs: 60_000, prefix: 'short-link' })
  if (rateLimited) return rateLimited

  const { code } = await params
  const targetUrl = await ShortLinkService.resolve(code)
  if (!targetUrl) {
    return new NextResponse('This link has expired or does not exist.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
  return NextResponse.redirect(targetUrl, { status: 302 })
}
