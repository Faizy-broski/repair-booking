import { withMiddleware } from '@/backend/middleware'
import { GrnController } from '@/backend/controllers/supply-chain.controller'

export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => GrnController.create(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
