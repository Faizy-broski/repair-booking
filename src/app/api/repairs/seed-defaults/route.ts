import { NextRequest } from 'next/server'
import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { created, badRequest } from '@/backend/utils/api-response'

async function seedDefaults(req: NextRequest, ctx: any) {
  const businessId = ctx.businessId
  if (!businessId) return badRequest('Missing business context')

  // Check if statuses already exist to avoid duplicates
  const { count: statusCount } = await adminSupabase
    .from('repair_custom_statuses')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)

  if ((statusCount ?? 0) === 0) {
    const defaultStatuses = [
      { name: 'Received', color: '#64748b', sort_order: 1, is_terminal: false },
      { name: 'In Progress', color: '#0ea5e9', sort_order: 2, is_terminal: false },
      { name: 'Waiting for Parts', color: '#f59e0b', sort_order: 3, is_terminal: false },
      { name: 'Ready for Collection', color: '#10b981', sort_order: 4, is_terminal: false },
      { name: 'Collected', color: '#6366f1', sort_order: 5, is_terminal: true },
      { name: 'Unrepairable', color: '#ef4444', sort_order: 6, is_terminal: true },
    ]
    await adminSupabase.from('repair_custom_statuses').insert(
      defaultStatuses.map(s => ({ ...s, business_id: businessId }))
    )
  }

  // Check if faults already exist
  const { count: faultCount } = await adminSupabase
    .from('repair_faults')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)

  if ((faultCount ?? 0) === 0) {
    const defaultFaults = [
      { name: 'No Power', sort_order: 1 },
      { name: 'Broken Screen', sort_order: 2 },
      { name: 'Liquid Damage', sort_order: 3 },
      { name: 'Software Issue', sort_order: 4 },
      { name: 'Battery Issue', sort_order: 5 },
      { name: 'Charging Port', sort_order: 6 },
    ]
    await adminSupabase.from('repair_faults').insert(
      defaultFaults.map(f => ({ ...f, business_id: businessId }))
    )
  }

  return created({ message: 'Defaults seeded successfully' })
}

export const POST = withMiddleware(seedDefaults, { requiredRole: 'business_owner' })
