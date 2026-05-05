import { withMiddleware } from '@/backend/middleware'
import { GoogleReviewController } from '@/backend/controllers/google-review.controller'

// Redirects the authenticated user to Google's OAuth consent screen.
export const GET = withMiddleware(GoogleReviewController.initiateOAuth, { requiredRole: 'branch_manager' })
