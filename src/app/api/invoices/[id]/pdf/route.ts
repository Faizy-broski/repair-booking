import { withMiddleware } from '@/backend/middleware'
import { InvoiceController } from '@/backend/controllers/invoice.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => InvoiceController.generatePdf(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
