import { withMiddleware } from '@/backend/middleware'
import { CreditPaymentsController } from '@/backend/controllers/customer-ops.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => CreditPaymentsController.getCustomerCreditPayments(req, ctx, p.id)),
  { requiredRole: 'cashier' }
)
