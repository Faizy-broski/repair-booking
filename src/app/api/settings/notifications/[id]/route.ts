import { withMiddleware } from '@/backend/middleware'
import { NotificationController } from '@/backend/controllers/notification.controller'

// PATCH /api/settings/notifications/[id] — Update an existing template
export const PATCH = withMiddleware(NotificationController.updateTemplate, { requiredRole: 'business_owner', module: 'notifications' })
