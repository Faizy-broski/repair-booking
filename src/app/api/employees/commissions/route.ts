import { withMiddleware } from '@/backend/middleware'
import { CommissionController } from '@/backend/controllers/payroll.controller'

export const GET = withMiddleware(CommissionController.listAll, { requiredRole: 'branch_manager', module: 'employees' })
