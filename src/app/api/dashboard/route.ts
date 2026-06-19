import { withMiddleware } from '@/backend/middleware'
import { DashboardController } from '@/backend/controllers/dashboard.controller'

export const GET = withMiddleware(async (req, ctx) => {
  const section = new URL(req.url).searchParams.get('section')
  if (section === 'revenue') return DashboardController.getRevenue(req, ctx)
  if (section === 'main')    return DashboardController.getMain(req, ctx)
  return DashboardController.get(req, ctx)
}, { requiredRole: 'cashier' })
