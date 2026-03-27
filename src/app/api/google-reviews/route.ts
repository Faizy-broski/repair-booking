import { withMiddleware } from '@/backend/middleware'
import { GoogleReviewController } from '@/backend/controllers/google-review.controller'

export const GET = withMiddleware(GoogleReviewController.list, { requiredRole: 'branch_manager' })
export const POST = withMiddleware(GoogleReviewController.sync, { requiredRole: 'branch_manager' })
