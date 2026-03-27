import { withMiddleware } from '@/backend/middleware'
import { CustomerController } from '@/backend/controllers/customer.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => CustomerController.getById(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)
export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => CustomerController.update(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
