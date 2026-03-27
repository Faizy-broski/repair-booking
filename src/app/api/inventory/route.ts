import { withMiddleware } from '@/backend/middleware'
import { InventoryController } from '@/backend/controllers/inventory.controller'

export const GET = withMiddleware(InventoryController.list, { requiredRole: 'cashier' })
export const POST = withMiddleware(InventoryController.adjust, { requiredRole: 'staff' })
export const PUT = withMiddleware(InventoryController.setLevel, { requiredRole: 'branch_manager' })
