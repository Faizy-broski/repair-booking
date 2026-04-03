import { withMiddleware } from '@/backend/middleware'
import { InvoiceController } from '@/backend/controllers/invoice.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => InvoiceController.getById(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => InvoiceController.updateStatus(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
