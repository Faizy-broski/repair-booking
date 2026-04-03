import { withMiddleware } from '@/backend/middleware'
import { PurchaseOrderController } from '@/backend/controllers/supply-chain.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => PurchaseOrderController.getById(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => PurchaseOrderController.updateStatus(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
export const PUT = withMiddleware(
  (req, ctx, { params }) => params.then((p) => PurchaseOrderController.update(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
