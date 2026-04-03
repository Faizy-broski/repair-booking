import { withMiddleware } from '@/backend/middleware'
import { EmployeeController } from '@/backend/controllers/employee.controller'

export const GET = withMiddleware(EmployeeController.list, { requiredRole: 'cashier' })
export const POST = withMiddleware(EmployeeController.create, { requiredRole: 'branch_manager' })
