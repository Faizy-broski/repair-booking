import { withMiddleware } from '@/backend/middleware'
import { ExpenseController } from '@/backend/controllers/expense.controller'

export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ExpenseController.updateCategory(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
