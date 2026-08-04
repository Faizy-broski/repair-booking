import { withMiddleware } from '@/backend/middleware'
import { CustomerController } from '@/backend/controllers/customer.controller'

export const POST = withMiddleware(CustomerController.findOrCreate, { requiredRole: 'staff', module: 'customers' })
