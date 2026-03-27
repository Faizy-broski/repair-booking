import { withMiddleware } from '@/backend/middleware'
import { ShiftController } from '@/backend/controllers/payroll.controller'

export const PUT = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ShiftController.update(req, ctx, p.id)),
  { requiredRole: 'branch_manager', module: 'employees' }
)
export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ShiftController.remove(req, ctx, p.id)),
  { requiredRole: 'branch_manager', module: 'employees' }
)
