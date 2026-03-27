import { withMiddleware } from '@/backend/middleware'
import { UserController } from '@/backend/controllers/user.controller'

export const GET = withMiddleware(UserController.list, { requiredRole: 'business_owner' })
