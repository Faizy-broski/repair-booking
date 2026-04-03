import { withMiddleware } from '@/backend/middleware'
import { CustomerAssetController } from '@/backend/controllers/customer-ops.controller'

export const PUT    = withMiddleware(
  (req, ctx, { params }) => params.then((p) => CustomerAssetController.update(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => CustomerAssetController.remove(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
