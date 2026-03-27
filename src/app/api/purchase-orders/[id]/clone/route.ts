import { withMiddleware } from '@/backend/middleware'
import { PurchaseOrderController } from '@/backend/controllers/supply-chain.controller'

export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => PurchaseOrderController.clone(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
