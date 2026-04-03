import { withMiddleware } from '@/backend/middleware'
import { ReportController } from '@/backend/controllers/report.controller'

export const GET  = withMiddleware(ReportController.listSavedReports,  { requiredRole: 'branch_manager' })
export const POST = withMiddleware(ReportController.createSavedReport, { requiredRole: 'branch_manager', module: 'reports' })
