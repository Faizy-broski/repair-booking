import { withMiddleware } from '@/backend/middleware'
import { SupplierReturnController } from '@/backend/controllers/supplier-return.controller'

export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => SupplierReturnController.resolve(req, ctx, p.id)),
  { requiredRole: 'branch_manager', module: 'inventory' }
)
