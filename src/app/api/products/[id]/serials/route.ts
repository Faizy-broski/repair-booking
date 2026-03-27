import { withMiddleware } from '@/backend/middleware'
import { SerialController } from '@/backend/controllers/advanced-inventory.controller'

export const GET  = withMiddleware(
  (req, ctx, { params }) => params.then((p) => SerialController.list(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => SerialController.create(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
