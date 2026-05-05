import { withMiddleware } from '@/backend/middleware'
import { GoogleReviewController } from '@/backend/controllers/google-review.controller'
import type { RequestContext } from '@/backend/middleware'
import { NextRequest } from 'next/server'
import { badRequest } from '@/backend/utils/api-response'

async function postDispatch(request: NextRequest, ctx: RequestContext) {
  const body = await request.json().catch(() => ({}))
  const action = body?.action as string | undefined

  if (action === 'save_settings') {
    // Re-inject body as a readable stream for validateBody in the controller
    const newReq = new NextRequest(request.url, {
      method:  'POST',
      headers: request.headers,
      body:    JSON.stringify(body),
    })
    return GoogleReviewController.saveManualSettings(newReq, ctx)
  }

  if (action === 'sync' || !action) {
    return GoogleReviewController.sync(request, ctx)
  }

  return badRequest(`Unknown action: ${action}`)
}

export const GET  = withMiddleware(GoogleReviewController.list,     { requiredRole: 'branch_manager' })
export const POST = withMiddleware(postDispatch,                     { requiredRole: 'branch_manager' })
