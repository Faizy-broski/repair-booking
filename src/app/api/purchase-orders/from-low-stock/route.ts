import { withMiddleware } from '@/backend/middleware'
import { PurchaseOrderController } from '@/backend/controllers/supply-chain.controller'

export const POST = withMiddleware(PurchaseOrderController.createFromLowStock, { requiredRole: 'branch_manager' })
