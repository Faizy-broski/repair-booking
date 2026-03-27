import { withMiddleware } from '@/backend/middleware'
import { NotificationController } from '@/backend/controllers/notification.controller'

// GET  /api/settings/notifications — List all templates + trigger events + macro catalog
// POST /api/settings/notifications — Upsert a notification template
export const GET  = withMiddleware(NotificationController.listTemplates,  { requiredRole: 'branch_manager', module: 'notifications' })
export const POST = withMiddleware(NotificationController.upsertTemplate, { requiredRole: 'business_owner', module: 'notifications' })
