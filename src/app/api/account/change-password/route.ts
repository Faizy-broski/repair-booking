import { withMiddleware } from '@/backend/middleware'
import { UserController } from '@/backend/controllers/user.controller'

/**
 * POST /api/account/change-password
 *
 * Self-service password change for the logged-in user (any role). Requires
 * the caller's current password to be verified before writing a new one —
 * distinct from POST /api/users/[id]/reset-password, which is the owner's
 * admin "force reset" of a team member and explicitly refuses self/owner targets.
 */
export const POST = withMiddleware(UserController.changeOwnPassword)
