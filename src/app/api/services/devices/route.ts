import { withMiddleware } from '@/backend/middleware'
import { ServiceDeviceController } from '@/backend/controllers/service-hierarchy.controller'

export const GET  = withMiddleware(ServiceDeviceController.list,   { requiredRole: 'cashier' })
export const POST = withMiddleware(ServiceDeviceController.create,  { requiredRole: 'branch_manager' })
