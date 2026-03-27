import { withMiddleware } from '@/backend/middleware'
import { EmployeeController } from '@/backend/controllers/employee.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => EmployeeController.getById(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => EmployeeController.update(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
