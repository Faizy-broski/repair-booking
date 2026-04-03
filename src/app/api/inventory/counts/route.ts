import { withMiddleware } from '@/backend/middleware'
import { CountController } from '@/backend/controllers/advanced-inventory.controller'

export const GET  = withMiddleware(CountController.list,   { requiredRole: 'staff' })
export const POST = withMiddleware(CountController.create, { requiredRole: 'staff' })
