import { withMiddleware } from '@/backend/middleware'
import { InvoiceController } from '@/backend/controllers/invoice.controller'

export const GET = withMiddleware(InvoiceController.list, { requiredRole: 'staff' })
export const POST = withMiddleware(InvoiceController.create, { requiredRole: 'staff' })
