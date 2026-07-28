import { withMiddleware } from '@/backend/middleware'
import { BinController } from '@/backend/controllers/bin.controller'

export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => BinController.restore(req, ctx, p.id)),
  { requiredRole: 'branch_manager', module: 'inventory' }
)
