import { withMiddleware } from '@/backend/middleware'
import { ActivityLogController } from '@/backend/controllers/payroll.controller'

export const GET = withMiddleware(ActivityLogController.list, { requiredRole: 'branch_manager', module: 'employees' })
