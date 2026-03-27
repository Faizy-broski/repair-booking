import { withMiddleware } from '@/backend/middleware'
import { VerticalTemplateController } from '@/backend/controllers/vertical-template.controller'

export const GET    = withMiddleware(VerticalTemplateController.getById, { requiredRole: 'super_admin', skipTenant: true })
export const PATCH  = withMiddleware(VerticalTemplateController.update,  { requiredRole: 'super_admin', skipTenant: true })
export const DELETE = withMiddleware(VerticalTemplateController.delete,  { requiredRole: 'super_admin', skipTenant: true })
