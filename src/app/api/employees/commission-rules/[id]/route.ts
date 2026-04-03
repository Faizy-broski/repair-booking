import { withMiddleware } from '@/backend/middleware'
import { CommissionController } from '@/backend/controllers/payroll.controller'

export const PUT = withMiddleware(
  (req, ctx, { params }) => params.then((p) => CommissionController.updateRule(req, ctx, p.id)),
  { requiredRole: 'branch_manager', module: 'employees' }
)
export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => CommissionController.removeRule(req, ctx, p.id)),
  { requiredRole: 'branch_manager', module: 'employees' }
)
