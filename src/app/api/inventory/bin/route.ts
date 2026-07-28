import { withMiddleware } from '@/backend/middleware'
import { BinController } from '@/backend/controllers/bin.controller'

export const GET  = withMiddleware(BinController.list,     { requiredRole: 'staff' })
export const POST = withMiddleware(BinController.moveToBin, { requiredRole: 'staff', module: 'inventory' })
