import { withMiddleware } from '@/backend/middleware'
import { AppointmentController } from '@/backend/controllers/appointment.controller'

export const GET = withMiddleware(AppointmentController.list, { requiredRole: 'staff' })
export const POST = withMiddleware(AppointmentController.create, { requiredRole: 'staff' })
