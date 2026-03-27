import { withMiddleware } from '@/backend/middleware'
import { MessageController } from '@/backend/controllers/message.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => MessageController.getThread(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)
export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => MessageController.markRead(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)
