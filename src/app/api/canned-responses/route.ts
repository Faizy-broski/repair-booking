import { withMiddleware } from '@/backend/middleware'
import { CannedResponseController } from '@/backend/controllers/workflow.controller'

export const GET  = withMiddleware(CannedResponseController.list,   { requiredRole: 'cashier' })
export const POST = withMiddleware(CannedResponseController.create,  { requiredRole: 'staff' })
