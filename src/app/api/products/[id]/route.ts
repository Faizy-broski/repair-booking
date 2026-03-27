import { withMiddleware } from '@/backend/middleware'
import { ProductController } from '@/backend/controllers/product.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ProductController.getById(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)
export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ProductController.update(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ProductController.delete(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
