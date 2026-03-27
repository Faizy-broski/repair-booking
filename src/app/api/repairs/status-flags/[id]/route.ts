import { withMiddleware } from '@/backend/middleware'
import { RepairStatusFlagController } from '@/backend/controllers/workflow.controller'

export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => RepairStatusFlagController.remove(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
