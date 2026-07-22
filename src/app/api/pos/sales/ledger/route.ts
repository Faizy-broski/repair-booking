import { withMiddleware } from '@/backend/middleware'
import { PosController } from '@/backend/controllers/pos.controller'

export const GET = withMiddleware(PosController.listSalesLedger, { requiredRole: 'cashier' })
