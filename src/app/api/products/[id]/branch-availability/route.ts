import { withMiddleware } from '@/backend/middleware'
import { ProductController } from '@/backend/controllers/product.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ProductController.getBranchAvailability(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)

export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ProductController.setBranchAvailability(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
