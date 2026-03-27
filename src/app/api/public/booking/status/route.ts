import { withPublicMiddleware } from '@/backend/middleware/public.middleware'
import { PublicBookingController } from '@/backend/controllers/public-booking.controller'

export const GET = withPublicMiddleware(PublicBookingController.getStatus)
export const POST = withPublicMiddleware(PublicBookingController.cancel, { rateLimit: 10 })
