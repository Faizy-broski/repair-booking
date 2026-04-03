import { withMiddleware } from '@/backend/middleware'
import { ServiceProblemController } from '@/backend/controllers/service-hierarchy.controller'

export const GET  = withMiddleware(ServiceProblemController.list,   { requiredRole: 'cashier' })
export const POST = withMiddleware(ServiceProblemController.create,  { requiredRole: 'branch_manager' })
