import { withMiddleware } from '@/backend/middleware'
import { SupplierController } from '@/backend/controllers/supply-chain.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => SupplierController.getPaymentHistory(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
