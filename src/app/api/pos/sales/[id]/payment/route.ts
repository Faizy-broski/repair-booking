import { withMiddleware } from '@/backend/middleware'
import { PosController } from '@/backend/controllers/pos.controller'

export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => PosController.recordCreditPayment(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)
