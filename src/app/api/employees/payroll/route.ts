import { withMiddleware } from '@/backend/middleware'
import { PayrollController } from '@/backend/controllers/payroll.controller'

export const GET = withMiddleware(PayrollController.list, { requiredRole: 'branch_manager', module: 'employees' })
export const POST = withMiddleware(PayrollController.create, { requiredRole: 'branch_manager', module: 'employees' })
