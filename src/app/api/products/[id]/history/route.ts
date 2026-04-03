import { withMiddleware } from '@/backend/middleware'
import { ProductController } from '@/backend/controllers/product.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ProductController.getHistory(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)
