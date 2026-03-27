import { withMiddleware } from '@/backend/middleware'
import { AppointmentController } from '@/backend/controllers/appointment.controller'

export const GET = withMiddleware(AppointmentController.getBlockedDates, {
  requiredRole: 'staff',
  module: 'appointments',
})
export const POST = withMiddleware(AppointmentController.addBlockedDate, {
  requiredRole: 'branch_manager',
  module: 'appointments',
})
