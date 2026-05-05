import { withMiddleware } from '@/backend/middleware'
import { EmployeeController } from '@/backend/controllers/employee.controller'

export const GET = withMiddleware(EmployeeController.search, { requiredRole: 'cashier' })
