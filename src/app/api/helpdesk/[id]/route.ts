import { withMiddleware } from '@/backend/middleware'
import { HelpdeskController } from '@/backend/controllers/helpdesk.controller'

export const GET = withMiddleware(
  (req, ctx, { params }) => params.then((p) => HelpdeskController.get(req, ctx, { params: { id: p.id } })),
  { requiredRole: 'branch_manager' }
)

export const PATCH = withMiddleware(
  (req, ctx, { params }) => params.then((p) => HelpdeskController.update(req, ctx, { params: { id: p.id } })),
  { requiredRole: 'branch_manager' }
)

export const DELETE = withMiddleware(
  (req, ctx, { params }) => params.then((p) => HelpdeskController.delete(req, ctx, { params: { id: p.id } })),
  { requiredRole: 'branch_manager' }
)
