import { withMiddleware } from '@/backend/middleware'
import { BroadcastController } from '@/backend/controllers/broadcast.controller'

// GET  /api/admin/broadcasts?status=draft|active|archived
// POST /api/admin/broadcasts
export const GET  = withMiddleware(BroadcastController.list,   { requiredRole: 'super_admin', skipTenant: true, skipIpCheck: true })
export const POST = withMiddleware(BroadcastController.create, { requiredRole: 'super_admin', skipTenant: true, skipIpCheck: true })
