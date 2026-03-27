import { NextRequest } from 'next/server'
import { forbidden } from '@/backend/utils/api-response'

export function tenantMiddleware(
  request: NextRequest,
  authContext: { businessId: string | null }
): { businessId: string; error: null } | { businessId: null; error: ReturnType<typeof forbidden> } {
  // Business ID injected by middleware.ts via x-business-id header
  const headerBusinessId = request.headers.get('x-business-id')

  // Use auth context business ID as fallback (for API calls not via subdomain in dev)
  const businessId = headerBusinessId || authContext.businessId

  if (!businessId) {
    return { businessId: null, error: forbidden('Business context not found') }
  }

  // If both exist, validate they match (prevents cross-tenant attacks)
  if (headerBusinessId && authContext.businessId && headerBusinessId !== authContext.businessId) {
    return { businessId: null, error: forbidden('Business context mismatch') }
  }

  return { businessId, error: null }
}
