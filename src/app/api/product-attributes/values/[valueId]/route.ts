import { withMiddleware } from '@/backend/middleware'
import { ProductAttributeController } from '@/backend/controllers/product-attribute.controller'

export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then(({ valueId }) => ProductAttributeController.deleteValue(req, ctx, valueId)),
  { requiredRole: 'branch_manager' }
)
