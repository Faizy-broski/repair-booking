/**
 * withPublicMiddleware — lightweight middleware for unauthenticated public endpoints.
 *
 * Only applies rate limiting (stricter: 30 req/min). No auth, no tenant, no RBAC.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rateLimitMiddleware } from './rate-limit.middleware'
import { serverError } from '@/backend/utils/api-response'

export function withPublicMiddleware(
  handler: (request: NextRequest) => Promise<NextResponse>,
  options?: { rateLimit?: number }
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      // Rate limit: stricter for public endpoints (30/min default)
      const rateLimitError = rateLimitMiddleware(request, { limit: options?.rateLimit ?? 30 })
      if (rateLimitError) return rateLimitError

      return await handler(request)
    } catch (error) {
      return serverError('Unexpected error', error)
    }
  }
}
