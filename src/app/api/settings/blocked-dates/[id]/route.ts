import { withMiddleware } from '@/backend/middleware'
import { AppointmentController } from '@/backend/controllers/appointment.controller'

export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p: { id: string }) => AppointmentController.removeBlockedDate(req, ctx, p.id)),
  { requiredRole: 'branch_manager', module: 'appointments' }
)
