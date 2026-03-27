import { withMiddleware } from '@/backend/middleware'
import { ServiceProblemController } from '@/backend/controllers/service-hierarchy.controller'

export const GET    = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ServiceProblemController.getById(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)
export const PUT    = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ServiceProblemController.update(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ServiceProblemController.remove(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
