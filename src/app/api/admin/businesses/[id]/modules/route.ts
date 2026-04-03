import { withMiddleware } from '@/backend/middleware'
import { getBusinessModules } from '@/backend/controllers/module-config.controller'

// GET /api/admin/businesses/[id]/modules
// Returns all module access rows + resolved plan entitlements for a business.
export const GET = withMiddleware<{ id: string }>(getBusinessModules, { requiredRole: 'super_admin', skipTenant: true })
