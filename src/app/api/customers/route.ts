import { withMiddleware } from '@/backend/middleware'
import { CustomerController } from '@/backend/controllers/customer.controller'

export const GET = withMiddleware(CustomerController.list, { requiredRole: 'cashier' })
export const POST = withMiddleware(CustomerController.create, { requiredRole: 'staff' })
