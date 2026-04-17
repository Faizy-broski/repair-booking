import { withMiddleware } from '@/backend/middleware'
import { BusinessController } from '@/backend/controllers/business.controller'

export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => BusinessController.resetOwnerPassword(req, ctx, p.id)),
  { requiredRole: 'super_admin', skipTenant: true }
)
