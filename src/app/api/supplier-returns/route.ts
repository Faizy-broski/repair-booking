import { withMiddleware } from '@/backend/middleware'
import { SupplierReturnController } from '@/backend/controllers/supplier-return.controller'

export const GET  = withMiddleware(SupplierReturnController.list,   { requiredRole: 'staff' })
export const POST = withMiddleware(SupplierReturnController.create, { requiredRole: 'staff', module: 'inventory' })
