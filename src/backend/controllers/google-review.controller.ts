import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { GoogleReviewService } from '@/backend/services/google-review.service'
import { ok, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const settingsSchema = z.object({
  branch_id: z.string().uuid(),
  place_id: z.string().min(1),
  api_key: z.string().min(1),
})

export const GoogleReviewController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    try {
      const data = await GoogleReviewService.list(branchId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch reviews', err)
    }
  },

  async sync(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    try {
      await GoogleReviewService.sync(branchId)
      return ok({ synced: true })
    } catch (err) {
      return serverError('Failed to sync reviews', err)
    }
  },

  async getSettings(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    try {
      const settings = await GoogleReviewService.getSettings(branchId)
      return ok(settings)
    } catch (err) {
      return serverError('Failed to fetch review settings', err)
    }
  },

  async saveSettings(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, settingsSchema)
    if (error) return error
    try {
      await GoogleReviewService.saveSettings(data.branch_id, data.place_id, data.api_key)
      return ok({ saved: true })
    } catch (err) {
      return serverError('Failed to save review settings', err)
    }
  },
}
