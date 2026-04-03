import { withMiddleware } from '@/backend/middleware'
import { PayrollController } from '@/backend/controllers/payroll.controller'

export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => PayrollController.approve(req, ctx, p.id)),
  { requiredRole: 'branch_manager', module: 'employees' }
)
