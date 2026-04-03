import { withMiddleware } from '@/backend/middleware'
import { CountController } from '@/backend/controllers/advanced-inventory.controller'

export const GET   = withMiddleware(
  (req, ctx, { params }) => params.then((p) => CountController.getById(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => CountController.updateCounts(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
