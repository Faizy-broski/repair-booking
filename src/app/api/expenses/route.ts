import { withMiddleware } from '@/backend/middleware'
import { ExpenseController } from '@/backend/controllers/expense.controller'

export const GET = withMiddleware(ExpenseController.listExpenses, { requiredRole: 'staff' })
export const POST = withMiddleware(ExpenseController.createExpense, { requiredRole: 'staff' })
