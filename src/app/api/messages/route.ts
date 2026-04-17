import { withMiddleware } from '@/backend/middleware'
import { MessageController } from '@/backend/controllers/message.controller'

export const GET  = withMiddleware(MessageController.list,   { requiredRole: 'cashier' })
// POST (send message) gets a tighter per-business rate limit: 20 sends/min
export const POST = withMiddleware(MessageController.create, { requiredRole: 'cashier', rateLimit: { limit: 20, prefix: 'msg-send' } })
