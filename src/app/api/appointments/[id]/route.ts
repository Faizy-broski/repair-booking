import { withMiddleware } from '@/backend/middleware'
import { AppointmentController } from '@/backend/controllers/appointment.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => AppointmentController.getById(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => AppointmentController.update(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => AppointmentController.delete(req, ctx, p.id)),
  { requiredRole: 'staff' }
)
