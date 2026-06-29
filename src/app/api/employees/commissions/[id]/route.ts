import { withMiddleware } from '@/backend/middleware'
import { CommissionController } from '@/backend/controllers/payroll.controller'

export const PATCH = withMiddleware(
  (req, ctx) => {
    const id = req.nextUrl.pathname.split('/').pop()!
    return CommissionController.update(req, ctx, id)
  },
  { requiredRole: 'branch_manager', module: 'employees' }
)
