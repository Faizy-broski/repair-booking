import { withPublicMiddleware } from '@/backend/middleware/public.middleware'
import { PublicBookingController } from '@/backend/controllers/public-booking.controller'

// Stricter rate limit for booking creation (10 req/min)
export const POST = withPublicMiddleware(PublicBookingController.book, { rateLimit: 10 })
