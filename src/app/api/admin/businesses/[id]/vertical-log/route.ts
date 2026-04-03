import { withMiddleware } from '@/backend/middleware'
import { VerticalTemplateController } from '@/backend/controllers/vertical-template.controller'

export const GET = withMiddleware(VerticalTemplateController.getApplyLog, { requiredRole: 'super_admin', skipTenant: true })
