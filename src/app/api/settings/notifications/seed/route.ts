import { withMiddleware } from '@/backend/middleware'
import { NotificationController } from '@/backend/controllers/notification.controller'

// POST /api/settings/notifications/seed — Seed default templates for this business
export const POST = withMiddleware(NotificationController.seedTemplates, { requiredRole: 'business_owner', module: 'notifications' })
