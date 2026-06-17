import { withMiddleware } from '@/backend/middleware'
import { VerticalTemplateController } from '@/backend/controllers/vertical-template.controller'

/**
 * GET /api/admin/vertical-templates/[id]/businesses
 *
 * Lists all active businesses on this template with version drift info.
 * Response shape per item:
 *   { business_id, business_name, subdomain, applied_version, current_version, versions_behind }
 *
 * Meta includes: { total, behind } — "behind" = count of businesses needing a push.
 */
export const GET = withMiddleware(
  (req, ctx, routeCtx) => VerticalTemplateController.listBusinesses(req, ctx, routeCtx as any),
  { requiredRole: 'super_admin', skipTenant: true }
)
