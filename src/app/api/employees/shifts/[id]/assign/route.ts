import { withMiddleware } from '@/backend/middleware'
import { ShiftController } from '@/backend/controllers/payroll.controller'

export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ShiftController.assignEmployee(req, ctx, p.id)),
  { requiredRole: 'branch_manager', module: 'employees' }
)
