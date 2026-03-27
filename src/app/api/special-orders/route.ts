import { withMiddleware } from '@/backend/middleware'
import { SpecialOrderController } from '@/backend/controllers/supply-chain.controller'

export const GET  = withMiddleware(SpecialOrderController.list,   { requiredRole: 'staff' })
export const POST = withMiddleware(SpecialOrderController.create,  { requiredRole: 'staff' })
