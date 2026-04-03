import { withMiddleware } from '@/backend/middleware'
import { NotificationController } from '@/backend/controllers/notification.controller'

// GET  /api/settings/sms — Get SMS gateway config (masked)
// PUT  /api/settings/sms — Update SMS gateway credentials
export const GET = withMiddleware(NotificationController.getSmsConfig,    { requiredRole: 'business_owner' })
export const PUT = withMiddleware(NotificationController.updateSmsConfig, { requiredRole: 'business_owner', module: 'notifications' })
