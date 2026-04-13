import { withMiddleware } from '@/backend/middleware'
import { UserController } from '@/backend/controllers/user.controller'

/**
 * POST /api/users/[id]/reset-password
 *
 * Allows a business_owner to directly set a new password for any team member
 * (branch_manager, staff, cashier) that belongs to their business.
 *
 * Only business_owner may call this route. The service layer additionally
 * enforces that the target user belongs to the same business and is not
 * another business_owner.
 */
export const POST = withMiddleware(
  (req, ctx, { params }) =>
    params.then((p) => UserController.resetPassword(req, ctx, p.id)),
  { requiredRole: 'business_owner' }
)
