import { withMiddleware } from '@/backend/middleware'
import { PurchaseOrderController } from '@/backend/controllers/supply-chain.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => PurchaseOrderController.downloadReceipt(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
