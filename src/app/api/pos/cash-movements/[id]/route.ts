import { withMiddleware } from '@/backend/middleware'
import { PosController } from '@/backend/controllers/pos.controller'

export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => PosController.deleteCashMovement(req, ctx, p.id)),
  { requiredRole: 'branch_manager', module: 'pos' }
)
