import { NextRequest } from 'next/server'
import { withMiddleware, type RequestContext } from '@/backend/middleware'
import { GiftCardController } from '@/backend/controllers/gift-card.controller'

async function handleGet(request: NextRequest, ctx: RequestContext) {
  const code = request.nextUrl.searchParams.get('code')
  if (code) return GiftCardController.getByCode(request, ctx)
  return GiftCardController.list(request, ctx)
}

export const GET = withMiddleware(handleGet, { requiredRole: 'staff' })
export const POST = withMiddleware(GiftCardController.create, { requiredRole: 'staff' })
