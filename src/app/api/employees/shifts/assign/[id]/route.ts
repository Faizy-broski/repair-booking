import { withMiddleware } from '@/backend/middleware'
import { ShiftController } from '@/backend/controllers/payroll.controller'

export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ShiftController.removeAssignment(req, ctx, p.id)),
  { requiredRole: 'branch_manager', module: 'employees' }
)
