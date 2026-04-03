import { withMiddleware } from '@/backend/middleware'
import { ProductController } from '@/backend/controllers/product.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ProductController.getGroupPricing(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)

export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ProductController.setGroupPricing(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
