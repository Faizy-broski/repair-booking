import { withMiddleware } from '@/backend/middleware'
import { ExpenseController } from '@/backend/controllers/expense.controller'

export const PUT = withMiddleware(
  (req, ctx, { params }) => params.then(p => ExpenseController.updateExpense(req, ctx, p.id)),
  { requiredRole: 'staff' }
)

export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then(p => ExpenseController.deleteExpense(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
