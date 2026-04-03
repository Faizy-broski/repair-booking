import { withMiddleware } from '@/backend/middleware'
import { ProductController } from '@/backend/controllers/product.controller'

export const GET = withMiddleware(
  (req, ctx) => ProductController.getStats(req, ctx),
  { requiredRole: 'cashier' }
)
