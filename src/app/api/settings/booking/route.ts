import { withMiddleware } from '@/backend/middleware'
import { AppointmentController } from '@/backend/controllers/appointment.controller'

export const GET = withMiddleware(AppointmentController.getBookingSettings, {
  requiredRole: 'staff',
  module: 'appointments',
})
export const PUT = withMiddleware(AppointmentController.updateBookingSettings, {
  requiredRole: 'branch_manager',
  module: 'appointments',
})
