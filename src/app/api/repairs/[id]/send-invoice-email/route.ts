import { withMiddleware } from '@/backend/middleware'
import { RepairController } from '@/backend/controllers/repair.controller'

export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => RepairController.sendInvoiceEmail(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
