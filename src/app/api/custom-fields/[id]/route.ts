import { withMiddleware } from '@/backend/middleware'
import { CustomFieldController } from '@/backend/controllers/custom-field.controller'

export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => CustomFieldController.update(req, ctx, p.id)),
  { requiredRole: 'business_owner' }
)
export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => CustomFieldController.delete(req, ctx, p.id)),
  { requiredRole: 'business_owner' }
)
