import { withMiddleware } from '@/backend/middleware'
import {
  getModuleConfig,
  updateBranchModuleOverride,
} from '@/backend/controllers/module-config.controller'

// GET  /api/modules/config/[module]?branchId=<uuid>
// Returns resolved config for a single module.
export const GET = withMiddleware<{ module: string }>(getModuleConfig, { requiredRole: 'cashier' })

// PATCH /api/modules/config/[module]?branchId=<uuid>
// Body: { settings_override: { ... } }
// Updates branch-level module overrides. Invalidates server cache.
export const PATCH = withMiddleware<{ module: string }>(
  updateBranchModuleOverride,
  { requiredRole: 'branch_manager' }
)
