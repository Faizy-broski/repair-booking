import { withMiddleware } from '@/backend/middleware'
import { PosController } from '@/backend/controllers/pos.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => PosController.getSaleById(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)
