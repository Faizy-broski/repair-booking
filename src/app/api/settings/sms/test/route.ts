import { withMiddleware } from '@/backend/middleware'
import { NotificationController } from '@/backend/controllers/notification.controller'

// POST /api/settings/sms/test — Send a test SMS to validate gateway credentials
export const POST = withMiddleware(NotificationController.testSms, { requiredRole: 'business_owner', module: 'notifications' })
