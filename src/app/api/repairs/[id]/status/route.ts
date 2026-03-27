import { withMiddleware } from '@/backend/middleware'
import { RepairController } from '@/backend/controllers/repair.controller'

export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => RepairController.updateStatus(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
