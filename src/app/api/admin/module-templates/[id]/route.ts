import { withMiddleware } from '@/backend/middleware'
import { updateTemplate, deleteTemplate } from '@/backend/controllers/module-config.controller'

// PATCH  /api/admin/module-templates/[id]
// DELETE /api/admin/module-templates/[id]
export const PATCH  = withMiddleware<{ id: string }>(updateTemplate,  { requiredRole: 'super_admin', skipTenant: true })
export const DELETE = withMiddleware<{ id: string }>(deleteTemplate,  { requiredRole: 'super_admin', skipTenant: true })
