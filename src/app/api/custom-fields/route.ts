import { withMiddleware } from '@/backend/middleware'
import { CustomFieldController } from '@/backend/controllers/custom-field.controller'

export const GET = withMiddleware(CustomFieldController.list, { requiredRole: 'staff' })
export const POST = withMiddleware(CustomFieldController.create, { requiredRole: 'business_owner' })
