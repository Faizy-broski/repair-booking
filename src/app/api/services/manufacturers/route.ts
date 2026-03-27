import { withMiddleware } from '@/backend/middleware'
import { ServiceManufacturerController } from '@/backend/controllers/service-hierarchy.controller'

export const GET  = withMiddleware(ServiceManufacturerController.list,   { requiredRole: 'cashier' })
export const POST = withMiddleware(ServiceManufacturerController.create,  { requiredRole: 'branch_manager' })
