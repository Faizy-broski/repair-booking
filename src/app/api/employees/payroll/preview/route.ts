import { withMiddleware } from '@/backend/middleware'
import { PayrollController } from '@/backend/controllers/payroll.controller'

// GET /api/employees/payroll/preview?employee_id=&branch_id=&start_date=&end_date=
export const GET = withMiddleware(PayrollController.preview, { requiredRole: 'branch_manager', module: 'employees' })
