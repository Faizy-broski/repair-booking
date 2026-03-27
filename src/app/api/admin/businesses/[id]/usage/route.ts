import { withMiddleware } from '@/backend/middleware'
import { PlanLimitController } from '@/backend/controllers/plan-limit.controller'

export const GET = withMiddleware(PlanLimitController.getBusinessUsage, { requiredRole: 'super_admin', skipTenant: true })
