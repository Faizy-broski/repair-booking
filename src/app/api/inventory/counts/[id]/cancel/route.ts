import { withMiddleware } from '@/backend/middleware'
import { CountController } from '@/backend/controllers/advanced-inventory.controller'

export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => CountController.cancel(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
