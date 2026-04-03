import { withMiddleware } from '@/backend/middleware'
import { ReportController } from '@/backend/controllers/report.controller'

export const POST = withMiddleware(ReportController.joinSession, { requiredRole: 'cashier' })
