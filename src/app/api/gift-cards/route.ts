import { withMiddleware } from '@/backend/middleware'
import { GiftCardController } from '@/backend/controllers/gift-card.controller'

export const GET = withMiddleware(GiftCardController.list, { requiredRole: 'staff' })
export const POST = withMiddleware(GiftCardController.create, { requiredRole: 'staff' })
