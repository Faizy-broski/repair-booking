import { withMiddleware } from '@/backend/middleware'
import { ServiceProblemController } from '@/backend/controllers/service-hierarchy.controller'

export const PUT = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ServiceProblemController.setParts(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
