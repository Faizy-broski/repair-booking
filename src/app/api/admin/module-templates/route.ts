import { withMiddleware } from '@/backend/middleware'
import { listTemplates, createTemplate } from '@/backend/controllers/module-config.controller'

// GET  /api/admin/module-templates?module=<name>
// POST /api/admin/module-templates
export const GET  = withMiddleware(listTemplates, { requiredRole: 'super_admin', skipTenant: true })
export const POST = withMiddleware(createTemplate, { requiredRole: 'super_admin', skipTenant: true })
