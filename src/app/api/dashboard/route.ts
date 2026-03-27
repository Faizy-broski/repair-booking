import { withMiddleware } from '@/backend/middleware'
import { DashboardController } from '@/backend/controllers/dashboard.controller'

export const GET = withMiddleware(DashboardController.get, { requiredRole: 'cashier' })
