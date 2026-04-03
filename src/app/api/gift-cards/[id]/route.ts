import { withMiddleware } from '@/backend/middleware'
import { GiftCardController } from '@/backend/controllers/gift-card.controller'

export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => GiftCardController.update(req, ctx, p.id)),
  { requiredRole: 'branch_manager' }
)
