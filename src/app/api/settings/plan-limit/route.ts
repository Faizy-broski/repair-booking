import { withMiddleware } from '@/backend/middleware'
import { PlanLimitController } from '@/backend/controllers/plan-limit.controller'

export const GET = withMiddleware(PlanLimitController.checkLimit)
