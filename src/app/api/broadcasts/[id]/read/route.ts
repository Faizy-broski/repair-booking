import { withMiddleware } from '@/backend/middleware'
import { BroadcastController } from '@/backend/controllers/broadcast.controller'

// POST /api/broadcasts/:id/read — mark a broadcast as read for this user
export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => BroadcastController.markRead(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)
