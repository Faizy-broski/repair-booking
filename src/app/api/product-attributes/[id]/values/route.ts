import { withMiddleware } from '@/backend/middleware'
import { ProductAttributeController } from '@/backend/controllers/product-attribute.controller'

export const POST = withMiddleware(
  (req, ctx, { params }) => params.then(({ id }) => ProductAttributeController.addValue(req, ctx, id)),
  { requiredRole: 'branch_manager' }
)
