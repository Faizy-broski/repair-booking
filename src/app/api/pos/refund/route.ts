import { withMiddleware } from '@/backend/middleware'
import { PosController } from '@/backend/controllers/pos.controller'

export const POST = withMiddleware(PosController.processRefund, { requiredRole: 'cashier' })
