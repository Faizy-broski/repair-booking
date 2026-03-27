import { withMiddleware } from '@/backend/middleware'
import { MessageController } from '@/backend/controllers/message.controller'

export const GET = withMiddleware(MessageController.list, { requiredRole: 'cashier' })
export const POST = withMiddleware(MessageController.create, { requiredRole: 'cashier' })
