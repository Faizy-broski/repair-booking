import { withMiddleware } from '@/backend/middleware'
import { PayrollController } from '@/backend/controllers/payroll.controller'

export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => PayrollController.reopen(req, ctx, p.id)),
  { requiredRole: 'branch_manager', module: 'employees' }
)
