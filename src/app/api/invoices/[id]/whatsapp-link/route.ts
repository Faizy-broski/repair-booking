import { withMiddleware } from '@/backend/middleware'
import { InvoiceController } from '@/backend/controllers/invoice.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => InvoiceController.getWhatsAppLink(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
