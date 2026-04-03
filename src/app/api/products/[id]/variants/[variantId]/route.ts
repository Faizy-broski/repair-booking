import { withMiddleware } from '@/backend/middleware'
import { ProductController } from '@/backend/controllers/product.controller'

export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ProductController.updateVariant(req, ctx, p.id, p.variantId)),
  { requiredRole: 'branch_manager' }
)

export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ProductController.deleteVariant(req, ctx, p.id, p.variantId)),
  { requiredRole: 'branch_manager' }
)
