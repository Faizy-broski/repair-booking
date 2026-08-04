import { withMiddleware } from '@/backend/middleware'
import { VehicleController } from '@/backend/controllers/vehicle.controller'

export const GET = withMiddleware(VehicleController.list, { requiredRole: 'cashier' })
export const POST = withMiddleware(VehicleController.create, { requiredRole: 'staff', module: 'customers' })
