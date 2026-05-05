import { withMiddleware } from '@/backend/middleware'
import { type RequestContext } from '@/backend/middleware'
import { NextRequest } from 'next/server'
import { GoogleOAuthService } from '@/backend/services/google-oauth.service'
import { GoogleReviewService } from '@/backend/services/google-review.service'
import { ok, serverError, badRequest } from '@/backend/utils/api-response'

async function reloadLocations(request: NextRequest, ctx: RequestContext) {
  const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId
  if (!branchId) return badRequest('No branch context')

  try {
    const accessToken = await GoogleReviewService.getValidAccessToken(branchId)
    const accounts    = await GoogleOAuthService.listAccounts(accessToken)
    const locations: import('@/backend/services/google-oauth.service').GBPLocation[] = []

    for (const account of accounts) {
      const locs = await GoogleOAuthService.listLocations(accessToken, account.name)
      locations.push(...locs)
    }

    const settings = await GoogleReviewService.getSettings(branchId)
    await GoogleReviewService.saveOAuthTokens(
      branchId,
      settings!.access_token!,
      settings!.refresh_token!,
      3600,
      locations
    )

    return ok({ locations })
  } catch (err) {
    return serverError('Failed to load locations — the API may still be activating, please wait a minute and try again', err)
  }
}

export const POST = withMiddleware(reloadLocations, { requiredRole: 'branch_manager' })
