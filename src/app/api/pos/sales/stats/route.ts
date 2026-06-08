import { withMiddleware } from '@/backend/middleware'
import { PosController } from '@/backend/controllers/pos.controller'

export const GET = withMiddleware(
  (req, ctx) => PosController.getSalesStats(req, ctx),
  { requiredRole: 'cashier', module: 'pos' }
)
