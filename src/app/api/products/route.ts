import { withMiddleware } from '@/backend/middleware'
import { ProductController } from '@/backend/controllers/product.controller'

export const GET = withMiddleware(ProductController.list, { requiredRole: 'cashier' })
export const POST = withMiddleware(ProductController.create, { requiredRole: 'staff' })
