import { withMiddleware } from '@/backend/middleware'
import { IpWhitelistController } from '@/backend/controllers/payroll.controller'

export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => IpWhitelistController.remove(req, ctx, p.id)),
  { requiredRole: 'business_owner', module: 'employees' }
)
