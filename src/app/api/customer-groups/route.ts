import { withMiddleware } from '@/backend/middleware'
import { CustomerGroupController } from '@/backend/controllers/customer-ops.controller'

export const GET  = withMiddleware(CustomerGroupController.list,   { requiredRole: 'cashier' })
export const POST = withMiddleware(CustomerGroupController.create,  { requiredRole: 'branch_manager' })
