import { withMiddleware } from '@/backend/middleware'
import { HelpdeskController } from '@/backend/controllers/helpdesk.controller'

export const GET  = withMiddleware(HelpdeskController.list,   { requiredRole: 'branch_manager' })
export const POST = withMiddleware(HelpdeskController.create, { requiredRole: 'branch_manager' })
