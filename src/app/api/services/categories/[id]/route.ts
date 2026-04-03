import { withMiddleware } from '@/backend/middleware'
import { ServiceCategoryController } from '@/backend/controllers/service-hierarchy.controller'

export const PUT    = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ServiceCategoryController.update(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ServiceCategoryController.remove(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
