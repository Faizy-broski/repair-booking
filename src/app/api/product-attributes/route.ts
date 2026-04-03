import { withMiddleware } from '@/backend/middleware'
import { ProductAttributeController } from '@/backend/controllers/product-attribute.controller'

export const GET  = withMiddleware(ProductAttributeController.list,   { requiredRole: 'cashier' })
export const POST = withMiddleware(ProductAttributeController.create,  { requiredRole: 'branch_manager' })
