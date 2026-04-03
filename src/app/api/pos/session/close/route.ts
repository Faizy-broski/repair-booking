import { withMiddleware } from '@/backend/middleware'
import { ReportController } from '@/backend/controllers/report.controller'

export const POST = withMiddleware(ReportController.closeSession, {
  requiredRole: 'cashier',
  module: 'pos',
})
