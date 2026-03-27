import { withMiddleware } from '@/backend/middleware'
import { PosController } from '@/backend/controllers/pos.controller'

export const GET = withMiddleware(PosController.listSales, { requiredRole: 'cashier' })
export const POST = withMiddleware(PosController.processSale, { requiredRole: 'cashier' })
