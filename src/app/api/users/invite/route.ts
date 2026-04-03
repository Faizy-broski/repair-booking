import { withMiddleware } from '@/backend/middleware'
import { UserController } from '@/backend/controllers/user.controller'

export const POST = withMiddleware(UserController.invite, { requiredRole: 'business_owner' })
