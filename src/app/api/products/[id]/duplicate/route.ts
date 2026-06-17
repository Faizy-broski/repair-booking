import { withMiddleware } from '@/backend/middleware'
import { ProductController } from '@/backend/controllers/product.controller'

export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ProductController.duplicate(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
