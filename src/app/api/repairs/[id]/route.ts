import { withMiddleware } from '@/backend/middleware'
import { RepairController } from '@/backend/controllers/repair.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => RepairController.getById(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)
export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => RepairController.update(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
