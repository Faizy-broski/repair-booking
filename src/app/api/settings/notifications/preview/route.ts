import { withMiddleware } from '@/backend/middleware'
import { NotificationController } from '@/backend/controllers/notification.controller'

// POST /api/settings/notifications/preview — Preview a rendered template with sample data
export const POST = withMiddleware(NotificationController.previewTemplate, { requiredRole: 'branch_manager', module: 'notifications' })
