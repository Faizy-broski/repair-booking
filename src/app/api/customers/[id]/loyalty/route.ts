import { withMiddleware } from '@/backend/middleware'
import { LoyaltyController } from '@/backend/controllers/customer-ops.controller'

export const GET  = withMiddleware(
  (req, ctx, { params }) => params.then((p) => LoyaltyController.getCustomerPoints(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)
export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => LoyaltyController.addPoints(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
