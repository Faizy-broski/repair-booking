import { withMiddleware } from '@/backend/middleware'
import { InvoiceController } from '@/backend/controllers/invoice.controller'

export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => InvoiceController.recordPayment(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)
