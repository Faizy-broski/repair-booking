import { withMiddleware } from '@/backend/middleware'
import { pushTemplate } from '@/backend/controllers/module-config.controller'

// POST /api/admin/module-templates/[id]/push
// Body: { business_ids: string[] | 'all', push_mode: 'force_override' | 'merge_missing_only' }
export const POST = withMiddleware<{ id: string }>(pushTemplate, { requiredRole: 'super_admin', skipTenant: true })
