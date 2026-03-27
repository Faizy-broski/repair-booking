/**
 * PlanLimitController
 * Superadmin: view/manage plan limits.
 * Tenant: check own usage against plan limits.
 */
import { NextRequest, NextResponse } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { PlanLimitService } from '@/backend/services/plan-limit.service'
import { ok, badRequest, serverError } from '@/backend/utils/api-response'

export const PlanLimitController = {
  /** Tenant: get current usage summary for own business */
  async getUsageSummary(
    _request: NextRequest,
    ctx: RequestContext
  ): Promise<NextResponse> {
    try {
      const data = await PlanLimitService.getUsageSummary(ctx.businessId)
      if (!data) return ok({ plan_name: null, usage: {}, features: {} })
      return ok(data)
    } catch (error) {
      return serverError('Failed to get usage summary', error)
    }
  },

  /** Tenant: check a specific limit before action */
  async checkLimit(
    request: NextRequest,
    ctx: RequestContext
  ): Promise<NextResponse> {
    try {
      const url = new URL(request.url)
      const limitKey = url.searchParams.get('key')
      if (!limitKey) return badRequest('key query param is required')

      const result = await PlanLimitService.checkLimit(ctx.businessId, limitKey)
      return ok(result)
    } catch (error) {
      return serverError('Failed to check plan limit', error)
    }
  },

  /** Superadmin: get usage summary for any business */
  async getBusinessUsage(
    _request: NextRequest,
    _ctx: RequestContext,
    routeCtx: { params: Promise<{ id: string }> }
  ): Promise<NextResponse> {
    try {
      const { id: businessId } = await routeCtx.params
      const data = await PlanLimitService.getUsageSummary(businessId)
      if (!data) return ok({ plan_name: null, usage: {}, features: {} })
      return ok(data)
    } catch (error) {
      return serverError('Failed to get business usage', error)
    }
  },
}
