import { NextRequest, NextResponse } from 'next/server'
import { authMiddleware, type AuthContext } from './auth.middleware'
import { tenantMiddleware } from './tenant.middleware'
import { rbacMiddleware } from './rbac.middleware'
import { rateLimitMiddleware } from './rate-limit.middleware'
import { type Role } from '@/backend/config/constants'
import { serverError } from '@/backend/utils/api-response'
import { IpWhitelistService } from '@/backend/services/activity-log.service'
import { ActivityLogService } from '@/backend/services/activity-log.service'
import { forbidden } from '@/backend/utils/api-response'

export interface RequestContext {
  auth: AuthContext
  businessId: string
}

interface MiddlewareOptions {
  requiredRole?: Role
  skipTenant?: boolean // For SuperAdmin routes that don't need tenant context
  /** Module name for activity logging, e.g. 'pos', 'repairs'. If set, mutating methods are logged. */
  module?: string
  /** Skip IP whitelist check (e.g. for public/superadmin routes) */
  skipIpCheck?: boolean
}

/**
 * withMiddleware — composes auth, tenant, and RBAC middleware for API route handlers.
 *
 * Usage (plain):       export const GET  = withMiddleware(handler)
 * Usage (dynamic):     export const GET  = withMiddleware(handler, { requiredRole: 'staff' })
 * Dynamic-route handler receives (request, ctx, { params }) where params is a Promise<{ id: string }>
 */
export function withMiddleware<P extends Record<string, string>>(
  handler: (request: NextRequest, context: RequestContext, routeCtx: { params: Promise<P> }) => Promise<NextResponse>,
  options?: MiddlewareOptions
): (request: NextRequest, routeCtx: { params: Promise<P> }) => Promise<NextResponse>
export function withMiddleware(
  handler: (request: NextRequest, context: RequestContext) => Promise<NextResponse>,
  options?: MiddlewareOptions
): (request: NextRequest) => Promise<NextResponse>
export function withMiddleware(
  handler: (...args: any[]) => any,
  options: MiddlewareOptions = {}
) {
  return async (request: NextRequest, routeCtx?: any): Promise<NextResponse> => {
    try {
      // 0. Rate limiting (60 req/min per IP)
      const rateLimitError = rateLimitMiddleware(request)
      if (rateLimitError) return rateLimitError

      // 1. Auth check
      const { context: authCtx, error: authErr } = await authMiddleware(request)
      if (authErr) return authErr

      // 2. RBAC check (if role required)
      if (options.requiredRole) {
        const { error: rbacErr } = rbacMiddleware(authCtx.role, options.requiredRole)
        if (rbacErr) return rbacErr
      }

      // 3. IP whitelist check (non-owner roles only, skippable)
      if (!options.skipIpCheck && authCtx.businessId &&
          authCtx.role !== 'business_owner' && authCtx.role !== 'super_admin') {
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                      ?? request.headers.get('x-real-ip')
                      ?? '127.0.0.1'
        const allowed = await IpWhitelistService.isAllowed(authCtx.businessId, authCtx.userId, clientIp)
        if (!allowed) return forbidden('Access denied from this IP address')
      }

      // 4. Tenant resolution (unless superadmin route)
      let businessId: string

      if (options.skipTenant) {
        businessId = 'superadmin'
      } else {
        const { businessId: bId, error: tenantErr } = tenantMiddleware(request, authCtx)
        if (tenantErr) return tenantErr
        businessId = bId
      }

      const ctx: RequestContext = { auth: authCtx, businessId }

      // Activity logging for mutating HTTP methods
      const method = request.method.toUpperCase()
      if (options.module && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && authCtx.businessId) {
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                      ?? request.headers.get('x-real-ip')
                      ?? '127.0.0.1'
        ActivityLogService.log({
          business_id: authCtx.businessId,
          branch_id:   authCtx.branchId,
          user_id:     authCtx.userId,
          module:      options.module,
          action:      method,
          ip_address:  clientIp,
          user_agent:  request.headers.get('user-agent'),
          metadata:    { path: request.nextUrl.pathname },
        })
      }

      if (routeCtx) {
        return await handler(request, ctx, routeCtx)
      }
      return await handler(request, ctx)
    } catch (error) {
      return serverError('Unexpected error', error)
    }
  }
}
