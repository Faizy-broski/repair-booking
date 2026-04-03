import { withMiddleware } from '@/backend/middleware'
import { ShiftController } from '@/backend/controllers/payroll.controller'

export const GET  = withMiddleware(ShiftController.list,   { requiredRole: 'branch_manager', module: 'employees' })
export const POST = withMiddleware(ShiftController.create, { requiredRole: 'branch_manager', module: 'employees' })
