import { withMiddleware } from '@/backend/middleware'
import { RepairController } from '@/backend/controllers/repair.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => RepairController.getWhatsAppLink(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
