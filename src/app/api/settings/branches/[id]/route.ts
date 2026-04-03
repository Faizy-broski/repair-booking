import { withMiddleware } from '@/backend/middleware'
import { BranchController } from '@/backend/controllers/branch.controller'

export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => BranchController.update(req, ctx, p.id)),
  { requiredRole: 'business_owner' }
)
export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => BranchController.deactivate(req, ctx, p.id)),
  { requiredRole: 'business_owner' }
)
