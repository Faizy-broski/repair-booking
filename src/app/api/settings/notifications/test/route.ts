import { withMiddleware } from '@/backend/middleware'
import { NotificationController } from '@/backend/controllers/notification.controller'

// POST /api/settings/notifications/test — Send a test notification (email or SMS)
export const POST = withMiddleware(NotificationController.testNotification, { requiredRole: 'business_owner', module: 'notifications' })
