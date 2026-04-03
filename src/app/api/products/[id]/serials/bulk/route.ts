import { withMiddleware } from '@/backend/middleware'
import { SerialController } from '@/backend/controllers/advanced-inventory.controller'

export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => SerialController.bulkCreate(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
