import { withMiddleware } from '@/backend/middleware'
import { CustomerGroupController } from '@/backend/controllers/customer-ops.controller'

export const PUT    = withMiddleware(
  (req, ctx, { params }) => params.then((p) => CustomerGroupController.update(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => CustomerGroupController.remove(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
