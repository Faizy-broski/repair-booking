import { withMiddleware } from '@/backend/middleware'
import { PurchaseOrderController } from '@/backend/controllers/supply-chain.controller'

export const GET  = withMiddleware(PurchaseOrderController.list,   { requiredRole: 'staff' })
export const POST = withMiddleware(PurchaseOrderController.create,  { requiredRole: 'branch_manager' })
