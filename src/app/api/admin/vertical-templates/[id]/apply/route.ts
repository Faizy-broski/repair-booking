import { withMiddleware } from '@/backend/middleware'
import { VerticalTemplateController } from '@/backend/controllers/vertical-template.controller'

export const POST = withMiddleware(VerticalTemplateController.apply, { requiredRole: 'super_admin', skipTenant: true })
