import { withMiddleware } from '@/backend/middleware'
import { OtherIncomeController } from '@/backend/controllers/other-income.controller'

export const PUT = withMiddleware(
  (req, ctx, { params }) => params.then(p => OtherIncomeController.updateOtherIncome(req, ctx, p.id)),
  { requiredRole: 'staff' }
)

export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then(p => OtherIncomeController.deleteOtherIncome(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
