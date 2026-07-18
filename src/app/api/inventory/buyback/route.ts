import { withMiddleware } from '@/backend/middleware'
import { ProductController } from '@/backend/controllers/product.controller'

export const POST = withMiddleware(ProductController.recordBuyback, { requiredRole: 'staff' })
