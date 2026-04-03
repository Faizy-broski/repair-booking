import { withMiddleware } from '@/backend/middleware'
import { ServiceDeviceController } from '@/backend/controllers/service-hierarchy.controller'

export const PUT    = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ServiceDeviceController.update(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ServiceDeviceController.remove(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
