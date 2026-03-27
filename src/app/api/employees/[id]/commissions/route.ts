import { withMiddleware } from '@/backend/middleware'
import { CommissionController } from '@/backend/controllers/payroll.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => CommissionController.listForEmployee(req, ctx, p.id)),
  { requiredRole: 'branch_manager', module: 'employees' }
)
