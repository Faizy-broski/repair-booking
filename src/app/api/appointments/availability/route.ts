import { withMiddleware } from '@/backend/middleware'
import { AppointmentController } from '@/backend/controllers/appointment.controller'

export const GET = withMiddleware(AppointmentController.getAvailability, {
  requiredRole: 'staff',
  module: 'appointments',
})
