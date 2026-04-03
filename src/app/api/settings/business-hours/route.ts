import { withMiddleware } from '@/backend/middleware'
import { AppointmentController } from '@/backend/controllers/appointment.controller'

export const GET = withMiddleware(AppointmentController.getBusinessHours, {
  requiredRole: 'staff',
  module: 'appointments',
})
export const PUT = withMiddleware(AppointmentController.updateBusinessHours, {
  requiredRole: 'branch_manager',
  module: 'appointments',
})
