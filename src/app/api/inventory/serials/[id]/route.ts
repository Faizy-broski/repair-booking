import { withMiddleware } from '@/backend/middleware'
import { SerialController } from '@/backend/controllers/advanced-inventory.controller'

export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => SerialController.updateStatus(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => SerialController.remove(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
