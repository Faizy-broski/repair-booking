import { withMiddleware } from '@/backend/middleware'
import { BusinessController } from '@/backend/controllers/business.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => BusinessController.getDetails(req, ctx, p.id)),
  { requiredRole: 'super_admin', skipTenant: true }
)
