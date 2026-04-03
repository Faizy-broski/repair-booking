import { withMiddleware } from '@/backend/middleware'
import { LoyaltyController } from '@/backend/controllers/customer-ops.controller'

export const GET  = withMiddleware(LoyaltyController.getSettings,  { requiredRole: 'cashier' })
export const POST = withMiddleware(LoyaltyController.saveSettings,  { requiredRole: 'branch_manager' })
