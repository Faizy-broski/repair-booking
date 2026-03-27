import { withMiddleware } from '@/backend/middleware'
import { CustomerAssetController } from '@/backend/controllers/customer-ops.controller'

export const GET  = withMiddleware(
  (req, ctx, { params }) => params.then((p) => CustomerAssetController.list(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)
export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => CustomerAssetController.create(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
