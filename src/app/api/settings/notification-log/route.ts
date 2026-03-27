import { withMiddleware } from '@/backend/middleware'
import { NotificationController } from '@/backend/controllers/notification.controller'

// GET /api/settings/notification-log — Query notification delivery log
export const GET = withMiddleware(NotificationController.getLog, { requiredRole: 'branch_manager' })
