import { withMiddleware } from '@/backend/middleware'
import { ReportController } from '@/backend/controllers/report.controller'

export const GET = withMiddleware(ReportController.getInventoryDetailReports, { requiredRole: 'branch_manager' })
