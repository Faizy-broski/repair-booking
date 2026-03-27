import { withMiddleware } from '@/backend/middleware'
import { pushTemplateDiffPreview } from '@/backend/controllers/module-config.controller'

export const POST = withMiddleware(pushTemplateDiffPreview, { requiredRole: 'super_admin', skipTenant: true })
