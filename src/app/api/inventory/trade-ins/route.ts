import { withMiddleware } from '@/backend/middleware'
import { TradeInController } from '@/backend/controllers/advanced-inventory.controller'

export const GET  = withMiddleware(TradeInController.list,   { requiredRole: 'staff' })
export const POST = withMiddleware(TradeInController.create, { requiredRole: 'staff' })
