import { withMiddleware } from '@/backend/middleware'
import { BroadcastController } from '@/backend/controllers/broadcast.controller'

// POST /api/admin/broadcasts/:id/publish — promotes draft → active (triggers Realtime)
export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) => BroadcastController.publish(req, ctx, p.id)),
  { requiredRole: 'super_admin', skipTenant: true, skipIpCheck: true }
)
