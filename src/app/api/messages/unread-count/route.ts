import { withMiddleware } from '@/backend/middleware'
import { MessageController } from '@/backend/controllers/message.controller'

export const GET = withMiddleware(MessageController.unreadCount, { requiredRole: 'cashier' })
