import { withMiddleware } from '@/backend/middleware'
import { GoogleReviewController } from '@/backend/controllers/google-review.controller'

export const GET    = withMiddleware(GoogleReviewController.getLocations,   { requiredRole: 'branch_manager' })
export const POST   = withMiddleware(GoogleReviewController.saveLocation,   { requiredRole: 'branch_manager' })
export const DELETE = withMiddleware(GoogleReviewController.disconnect,     { requiredRole: 'branch_manager' })
