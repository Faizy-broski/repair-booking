import { withMiddleware } from '@/backend/middleware'
import { RepairStatusFlagController } from '@/backend/controllers/workflow.controller'

export const GET  = withMiddleware(RepairStatusFlagController.list,   { requiredRole: 'cashier' })
export const POST = withMiddleware(RepairStatusFlagController.upsert,  { requiredRole: 'branch_manager' })
