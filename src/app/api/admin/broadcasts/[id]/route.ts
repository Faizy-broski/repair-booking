import { withMiddleware } from '@/backend/middleware'
import { BroadcastController } from '@/backend/controllers/broadcast.controller'

// PATCH  /api/admin/broadcasts/:id        — edit title/body/type/expiry
// DELETE /api/admin/broadcasts/:id        — archive
export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => BroadcastController.update(req, ctx, p.id)),
  { requiredRole: 'super_admin', skipTenant: true, skipIpCheck: true }
)

export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => BroadcastController.archive(req, ctx, p.id)),
  { requiredRole: 'super_admin', skipTenant: true, skipIpCheck: true }
)
