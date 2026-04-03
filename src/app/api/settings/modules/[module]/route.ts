import { withMiddleware } from '@/backend/middleware'
import { updateBusinessModuleSettings } from '@/backend/controllers/module-config.controller'

// PATCH /api/settings/modules/[module]
// Body: { settings_override: { ... } }
// Updates business-level module settings override.
// Auth: business_owner only (enforced in controller).
// Invalidates server cache for all branches of the business.
export const PATCH = withMiddleware<{ module: string }>(
  updateBusinessModuleSettings,
  { requiredRole: 'business_owner' }
)
