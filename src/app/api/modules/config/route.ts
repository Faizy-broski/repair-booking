import { withMiddleware } from '@/backend/middleware'
import { getAllModuleConfigs } from '@/backend/controllers/module-config.controller'

// GET /api/modules/config?branchId=<uuid>
// Returns resolved configs for all 13 modules via single DB RPC call.
// Cached in-process for 5 minutes per branchId.
export const GET = withMiddleware(getAllModuleConfigs, { requiredRole: 'cashier' })
