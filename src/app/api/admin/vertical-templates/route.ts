import { withMiddleware } from '@/backend/middleware'
import { VerticalTemplateController } from '@/backend/controllers/vertical-template.controller'

export const GET  = withMiddleware(VerticalTemplateController.list,   { requiredRole: 'super_admin', skipTenant: true })
export const POST = withMiddleware(VerticalTemplateController.create, { requiredRole: 'super_admin', skipTenant: true })
