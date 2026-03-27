import { withMiddleware } from '@/backend/middleware'
import { NotificationController } from '@/backend/controllers/notification.controller'

// GET  /api/settings/invoice-reminders — Get invoice reminder settings
// PUT  /api/settings/invoice-reminders — Update invoice reminder settings
export const GET = withMiddleware(NotificationController.getInvoiceReminders,    { requiredRole: 'branch_manager' })
export const PUT = withMiddleware(NotificationController.updateInvoiceReminders, { requiredRole: 'business_owner', module: 'notifications' })
