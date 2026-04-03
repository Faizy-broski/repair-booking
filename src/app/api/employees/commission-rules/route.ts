import { withMiddleware } from '@/backend/middleware'
import { CommissionController } from '@/backend/controllers/payroll.controller'

export const GET  = withMiddleware(CommissionController.listRules, { requiredRole: 'branch_manager', module: 'employees' })
export const POST = withMiddleware(CommissionController.createRule, { requiredRole: 'branch_manager', module: 'employees' })
