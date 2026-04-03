import { withMiddleware } from '@/backend/middleware'
import { updateBusinessModule } from '@/backend/controllers/module-config.controller'

// PATCH /api/admin/businesses/[id]/modules/[module]
// Body: { is_enabled?, plan_override?, template_id?, settings_override? }
// Superadmin control over per-business module access.
export const PATCH = withMiddleware<{ id: string; module: string }>(
  updateBusinessModule,
  { requiredRole: 'super_admin', skipTenant: true }
)
