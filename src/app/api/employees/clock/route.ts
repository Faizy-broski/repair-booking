import { withMiddleware } from '@/backend/middleware'
import { EmployeeController } from '@/backend/controllers/employee.controller'

export const GET = withMiddleware(EmployeeController.getTimeLogs, { requiredRole: 'branch_manager' })
export const POST = withMiddleware(EmployeeController.clock, { requiredRole: 'staff' })
