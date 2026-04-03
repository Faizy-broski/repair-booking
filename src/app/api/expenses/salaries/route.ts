import { withMiddleware } from '@/backend/middleware'
import { ExpenseController } from '@/backend/controllers/expense.controller'

export const GET = withMiddleware(ExpenseController.listSalaries, { requiredRole: 'branch_manager' })
export const POST = withMiddleware(ExpenseController.createSalary, { requiredRole: 'branch_manager' })
