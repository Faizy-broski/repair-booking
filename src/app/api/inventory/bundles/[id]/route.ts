import { withMiddleware } from '@/backend/middleware'
import { BundleController } from '@/backend/controllers/advanced-inventory.controller'

export const PUT = withMiddleware(
  (req, ctx, { params }) => params.then((p) => BundleController.update(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => BundleController.remove(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
