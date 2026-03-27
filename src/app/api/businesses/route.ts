import { withMiddleware } from '@/backend/middleware'
import { BusinessController } from '@/backend/controllers/business.controller'

export const GET = withMiddleware(BusinessController.list, { requiredRole: 'super_admin', skipTenant: true })
