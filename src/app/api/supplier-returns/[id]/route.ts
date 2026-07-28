import { withMiddleware } from '@/backend/middleware'
import { SupplierReturnController } from '@/backend/controllers/supplier-return.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => SupplierReturnController.getById(req, ctx, p.id)),
  { requiredRole: 'staff' }
)

export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => SupplierReturnController.updateItems(req, ctx, p.id)),
  { requiredRole: 'staff', module: 'inventory' }
)
