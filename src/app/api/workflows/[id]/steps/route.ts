import { withMiddleware } from '@/backend/middleware'
import { WorkflowController } from '@/backend/controllers/workflow.controller'

export const PUT = withMiddleware(
  (req, ctx, { params }) => params.then((p) => WorkflowController.setSteps(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
