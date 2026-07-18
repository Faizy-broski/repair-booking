import { withMiddleware } from '@/backend/middleware'
import { ProductController } from '@/backend/controllers/product.controller'

export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ProductController.updateCostLayer(req, ctx, p.layerId)),
  { requiredRole: 'staff' }
)

export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ProductController.deleteCostLayer(req, ctx, p.layerId)),
  { requiredRole: 'staff' }
)
