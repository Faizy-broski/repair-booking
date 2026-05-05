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
export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => {
    // ?message=true → delete a single message row; default → delete the whole thread
    const single = req.nextUrl.searchParams.get('message') === 'true'
    return single
      ? MessageController.deleteMessage(req, ctx, p.id)
      : MessageController.deleteThread(req, ctx, p.id)
  }),
  { requiredRole: 'cashier' }
)
