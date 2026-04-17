import { withMiddleware } from '@/backend/middleware'
import { InvoiceSettingsController } from '@/backend/controllers/invoice-settings.controller'

export const GET = withMiddleware(InvoiceSettingsController.get,    { requiredRole: 'staff' })
export const PUT = withMiddleware(InvoiceSettingsController.upsert, { requiredRole: 'branch_manager' })
