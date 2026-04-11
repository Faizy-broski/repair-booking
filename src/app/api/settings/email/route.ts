import { withMiddleware } from '@/backend/middleware'
import { NotificationController } from '@/backend/controllers/notification.controller'

// GET  /api/settings/email — Get SMTP config for the business (password masked)
// PUT  /api/settings/email — Save SMTP config
export const GET = withMiddleware(NotificationController.getEmailConfig,    { requiredRole: 'business_owner' })
export const PUT = withMiddleware(NotificationController.updateEmailConfig, { requiredRole: 'business_owner' })
