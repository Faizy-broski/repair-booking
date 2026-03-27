import { withMiddleware } from '@/backend/middleware'
import { EmployeeController } from '@/backend/controllers/employee.controller'

export const GET = withMiddleware(EmployeeController.list, { requiredRole: 'branch_manager' })
export const POST = withMiddleware(EmployeeController.create, { requiredRole: 'branch_manager' })
