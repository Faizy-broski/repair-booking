import { withMiddleware } from '@/backend/middleware'
import { SpecialOrderController } from '@/backend/controllers/supply-chain.controller'

export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => SpecialOrderController.updateStatus(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
