import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'

/**
 * GET /api/repairs/meta?branch_id=...
 *
 * Returns all config data needed by the repairs page in a single round-trip.
 * Previously the client made 3 separate calls (custom-statuses, faults, employees),
 * each requiring its own Supabase connection. Here all 3 queries run in parallel
 * server-side and are returned in one response.
 *
 * Cached client-side with staleTime: Infinity — only refetched when settings change.
 */
export const GET = withMiddleware(async (req, ctx) => {
  const branchId = req.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId
  try {
    // Cast each query to avoid "excessively deep type instantiation" from
    // chained Supabase builder types with multiple .order() calls.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = adminSupabase as any
    const [statusesResult, faultsResult] = await Promise.all([
      db
        .from('repair_custom_statuses')
        .select('*')
        .eq('business_id', ctx.businessId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }) as Promise<{ data: Record<string, unknown>[] | null; error: unknown }>,

      db
        .from('repair_faults')
        .select('*')
        .eq('business_id', ctx.businessId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }) as Promise<{ data: Record<string, unknown>[] | null; error: unknown }>,
    ])

    if (statusesResult.error) throw statusesResult.error
    if (faultsResult.error) throw faultsResult.error

    return ok({
      customStatuses: statusesResult.data ?? [],
      faults:         faultsResult.data   ?? [],
    })
  } catch (err) {
    return serverError('Failed to fetch repair meta', err)
  }
}, { requiredRole: 'cashier' })
