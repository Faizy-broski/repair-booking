import { withMiddleware } from '@/backend/middleware'
import { ReportController } from '@/backend/controllers/report.controller'

export const PUT    = withMiddleware(ReportController.updateSavedReport, { requiredRole: 'branch_manager', module: 'reports' })
export const DELETE = withMiddleware(ReportController.deleteSavedReport, { requiredRole: 'branch_manager', module: 'reports' })
