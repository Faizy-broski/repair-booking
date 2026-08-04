import { withMiddleware } from '@/backend/middleware'
import { VehicleController } from '@/backend/controllers/vehicle.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => VehicleController.getById(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)
export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => VehicleController.update(req, ctx, p.id)),
  { requiredRole: 'staff', module: 'customers' }
)
export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => VehicleController.remove(req, ctx, p.id)),
  { requiredRole: 'staff', module: 'customers' }
)
