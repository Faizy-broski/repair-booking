import { withMiddleware } from '@/backend/middleware'
import { StoreCreditController } from '@/backend/controllers/customer-ops.controller'

export const GET  = withMiddleware(
  (req, ctx, { params }) => params.then((p) => StoreCreditController.getBalance(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)
export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => StoreCreditController.credit(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)
export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => StoreCreditController.adjust(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
