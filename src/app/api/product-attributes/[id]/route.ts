import { withMiddleware } from '@/backend/middleware'
import { ProductAttributeController } from '@/backend/controllers/product-attribute.controller'

export const PUT = withMiddleware(
  (req, ctx, { params }) => params.then(({ id }) => ProductAttributeController.update(req, ctx, id)),
  { requiredRole: 'branch_manager' }
)

export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then(({ id }) => ProductAttributeController.delete(req, ctx, id)),
  { requiredRole: 'branch_manager' }
)
