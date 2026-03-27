import { withMiddleware } from '@/backend/middleware'
import { SupplierController } from '@/backend/controllers/supply-chain.controller'

export const GET  = withMiddleware(SupplierController.list,   { requiredRole: 'staff' })
export const POST = withMiddleware(SupplierController.create,  { requiredRole: 'branch_manager' })
