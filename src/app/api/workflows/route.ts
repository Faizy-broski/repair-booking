import { withMiddleware } from '@/backend/middleware'
import { WorkflowController } from '@/backend/controllers/workflow.controller'

export const GET  = withMiddleware(WorkflowController.list,   { requiredRole: 'cashier' })
export const POST = withMiddleware(WorkflowController.create,  { requiredRole: 'branch_manager' })
