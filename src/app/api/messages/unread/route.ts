import { withMiddleware } from '@/backend/middleware'
import { MessageController } from '@/backend/controllers/message.controller'

// GET /api/messages/unread — returns { count, messages[] } for the bell dropdown
export const GET = withMiddleware(MessageController.listUnread, { requiredRole: 'cashier' })
