import { withMiddleware } from '@/backend/middleware'
import { PosController } from '@/backend/controllers/pos.controller'

export const POST = withMiddleware(
  (req, ctx) => PosController.processExchange(req, ctx),
  { requiredRole: 'cashier' }
)
