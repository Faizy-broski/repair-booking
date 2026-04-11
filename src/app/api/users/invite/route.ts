import { withMiddleware } from '@/backend/middleware'
import { UserController } from '@/backend/controllers/user.controller'

export const POST = withMiddleware(UserController.create, { requiredRole: 'business_owner' })
