import { withMiddleware } from '@/backend/middleware'
import { ReportController } from '@/backend/controllers/report.controller'

export const GET  = withMiddleware(ReportController.listCashMovements, { requiredRole: 'cashier' })
export const POST = withMiddleware(ReportController.addCashMovement,   { requiredRole: 'cashier', module: 'pos' })
