import { withMiddleware } from '@/backend/middleware'
import { NotificationController } from '@/backend/controllers/notification.controller'

// POST /api/settings/email/test — Send a test email to validate SMTP credentials
export const POST = withMiddleware(NotificationController.testEmailConfig, { requiredRole: 'business_owner' })
