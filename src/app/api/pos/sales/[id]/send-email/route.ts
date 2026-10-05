import { withMiddleware } from '@/backend/middleware'
import { PosController } from '@/backend/controllers/pos.controller'

export const POST = withMiddleware(
  (req, ctx, { params }) => params.then((p) =>
    PosController.sendReceiptEmail(req, ctx, p.id, req.nextUrl.searchParams.get('paymentId') ?? undefined)
  ),
  { requiredRole: 'cashier' }
)
