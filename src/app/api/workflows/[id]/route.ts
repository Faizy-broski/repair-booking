import { withMiddleware } from '@/backend/middleware'
import { WorkflowController } from '@/backend/controllers/workflow.controller'

export const PUT    = withMiddleware(
  (req, ctx, { params }) => params.then((p) => WorkflowController.update(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => WorkflowController.remove(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
