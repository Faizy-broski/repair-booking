import { withMiddleware } from '@/backend/middleware'
import { SupplierController } from '@/backend/controllers/supply-chain.controller'

export const PUT    = withMiddleware(
  (req, ctx, { params }) => params.then((p) => SupplierController.update(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => SupplierController.remove(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
