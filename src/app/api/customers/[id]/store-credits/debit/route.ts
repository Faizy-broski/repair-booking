import { withMiddleware } from '@/backend/middleware'
import { StoreCreditController } from '@/backend/controllers/customer-ops.controller'

export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => StoreCreditController.debit(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)
