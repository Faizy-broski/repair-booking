import { withMiddleware } from '@/backend/middleware'
import { PermissionController } from '@/backend/controllers/payroll.controller'

export const GET  = withMiddleware(PermissionController.list,     { requiredRole: 'business_owner', module: 'employees' })
export const POST = withMiddleware(PermissionController.bulkSave, { requiredRole: 'business_owner', module: 'employees' })
