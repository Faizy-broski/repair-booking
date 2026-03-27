import { withMiddleware } from '@/backend/middleware'
import { InvoiceController } from '@/backend/controllers/invoice.controller'

export const GET = withMiddleware(InvoiceController.getStatusSummary, { requiredRole: 'cashier' })
