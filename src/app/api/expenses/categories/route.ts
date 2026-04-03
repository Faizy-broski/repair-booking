import { withMiddleware } from '@/backend/middleware'
import { ExpenseController } from '@/backend/controllers/expense.controller'

export const GET = withMiddleware(ExpenseController.listCategories, { requiredRole: 'staff' })
