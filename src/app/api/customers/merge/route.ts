import { withMiddleware } from '@/backend/middleware'
import { CustomerMergeController } from '@/backend/controllers/customer-ops.controller'

export const POST = withMiddleware(CustomerMergeController.merge, { requiredRole: 'branch_manager' })
