import { withMiddleware } from '@/backend/middleware'
import { LoyaltyController } from '@/backend/controllers/customer-ops.controller'

export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => LoyaltyController.redeemPoints(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)
