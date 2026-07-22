import { withMiddleware } from '@/backend/middleware'
import { ReportController } from '@/backend/controllers/report.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => ReportController.previewExpectedCash(req, ctx, p.id)),
  { requiredRole: 'cashier', module: 'pos' }
)

