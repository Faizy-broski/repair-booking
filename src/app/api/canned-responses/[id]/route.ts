import { withMiddleware } from '@/backend/middleware'
import { CannedResponseController } from '@/backend/controllers/workflow.controller'

export const PUT    = withMiddleware(
  (req, ctx, { params }) => params.then((p) => CannedResponseController.update(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => CannedResponseController.remove(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
