import { withMiddleware } from '@/backend/middleware'
import { VerticalTemplateController } from '@/backend/controllers/vertical-template.controller'

/**
 * POST /api/admin/vertical-templates/[id]/bulk-push
 *
 * Pushes the current template version to businesses on it.
 *
 * Body:
 *   mode         'merge' (default) | 'reapply'
 *   only_behind  true (default) — skip businesses already on the current version
 *
 * merge (recommended for adding modules):
 *   Adds new modules to each business without touching any existing config.
 *   Idempotent — safe to re-run.
 *
 * reapply (use with care):
 *   Resets all module settings to match the template exactly.
 *   Use when you need to correct settings that drifted (e.g. wrong tax rate).
 *
 * Response: { pushed, skipped, businesses: [ids] }
 */
export const POST = withMiddleware(
  (req, ctx, routeCtx) => VerticalTemplateController.bulkPush(req, ctx, routeCtx as any),
  { requiredRole: 'super_admin', skipTenant: true }
)
