import { withMiddleware } from '@/backend/middleware'
import { IpWhitelistController } from '@/backend/controllers/payroll.controller'

export const GET  = withMiddleware(IpWhitelistController.list, { requiredRole: 'business_owner', module: 'employees' })
export const POST = withMiddleware(IpWhitelistController.add,  { requiredRole: 'business_owner', module: 'employees' })
