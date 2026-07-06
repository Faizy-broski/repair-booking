import { withMiddleware } from '@/backend/middleware'
import { StoreCreditController } from '@/backend/controllers/customer-ops.controller'

/**
 * GET /api/store-credits
 *
 * Business-wide feed of store-credit wallet activity (top-ups, spends,
 * refunds, adjustments) across all customers — powers the "Store Credit
 * Activity" view on the Customer Credit page. Distinct from the on-account
 * sales listed there today (unrelated data source).
 */
export const GET = withMiddleware(
  (req, ctx) => StoreCreditController.listBusiness(req, ctx),
  { requiredRole: 'branch_manager' }
)
