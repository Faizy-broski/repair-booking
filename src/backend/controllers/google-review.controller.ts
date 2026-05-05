import { NextRequest, NextResponse } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { GoogleReviewService } from '@/backend/services/google-review.service'
import { GoogleOAuthService } from '@/backend/services/google-oauth.service'
import { ok, serverError, badRequest } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const manualSettingsSchema = z.object({
  place_id: z.string().min(1),
  api_key:  z.string().min(1),
})

const locationSchema = z.object({
  location_name:  z.string().min(1),
  location_title: z.string().min(1),
  place_id:       z.string().optional(),
})

export const GoogleReviewController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    if (!branchId) return badRequest('branch_id is required')
    try {
      const result = await GoogleReviewService.list(branchId)
      return ok(result)
    } catch (err) {
      return serverError('Failed to fetch reviews', err)
    }
  },

  async sync(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId
    if (!branchId) return badRequest('No branch context')
    try {
      await GoogleReviewService.sync(branchId)
      return ok({ synced: true })
    } catch (err) {
      return serverError('Sync failed', err)
    }
  },

  async saveManualSettings(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId
    if (!branchId) return badRequest('No branch context')
    const { data, error } = await validateBody(request, manualSettingsSchema)
    if (error) return error
    try {
      await GoogleReviewService.saveManualSettings(branchId, data.place_id, data.api_key)
      return ok({ saved: true })
    } catch (err) {
      return serverError('Failed to save settings', err)
    }
  },

  async initiateOAuth(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId
    if (!branchId) return badRequest('No branch context')

    // Extract subdomain from the host header — more reliable than x-subdomain for API routes
    const host       = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
    const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000').split(':')[0]
    const cleanHost  = host.split(':')[0]
    const subdomain  =
      request.headers.get('x-subdomain') ||
      (cleanHost.endsWith('.localhost') ? cleanHost.replace('.localhost', '') : null) ||
      (cleanHost.endsWith(`.${rootDomain}`) ? cleanHost.replace(`.${rootDomain}`, '') : null) ||
      ''

    try {
      const state   = GoogleOAuthService.encodeState({ branchId, subdomain, ts: Date.now() })
      const authUrl = GoogleOAuthService.buildAuthUrl(state)
      return NextResponse.redirect(authUrl)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'OAuth config error'
      return serverError(msg)
    }
  },

  async getLocations(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId
    if (!branchId) return badRequest('No branch context')
    try {
      const settings = await GoogleReviewService.getSettings(branchId)
      return ok({
        pending_locations: settings?.pending_locations ?? [],
        location_name:     settings?.location_name ?? null,
        location_title:    settings?.location_title ?? null,
      })
    } catch (err) {
      return serverError('Failed to fetch locations', err)
    }
  },

  async saveLocation(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId
    if (!branchId) return badRequest('No branch context')
    const { data, error } = await validateBody(request, locationSchema)
    if (error) return error
    try {
      await GoogleReviewService.saveSelectedLocation(
        branchId,
        data.location_name,
        data.location_title,
        data.place_id
      )
      return ok({ saved: true })
    } catch (err) {
      return serverError('Failed to save location', err)
    }
  },

  async disconnect(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId
    if (!branchId) return badRequest('No branch context')
    try {
      await GoogleReviewService.disconnect(branchId)
      return ok({ disconnected: true })
    } catch (err) {
      return serverError('Failed to disconnect', err)
    }
  },
}
