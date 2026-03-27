import { withMiddleware } from '@/backend/middleware'
import { UserController } from '@/backend/controllers/user.controller'

export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => UserController.update(req, ctx, p.id)),
  { requiredRole: 'business_owner' }
)
