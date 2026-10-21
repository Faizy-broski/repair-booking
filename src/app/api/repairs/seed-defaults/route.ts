import { NextRequest } from 'next/server'
import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { created, badRequest } from '@/backend/utils/api-response'
import {
  GENERIC_REPAIR_STATUSES,
  GENERIC_REPAIR_FAULTS,
  templateRepairDefaults,
} from '@/backend/services/repair-defaults.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = adminSupabase as any

async function seedDefaults(req: NextRequest, ctx: any) {
  const businessId = ctx.businessId
  if (!businessId) return badRequest('Missing business context')

  // Use the business's vertical template defaults (e.g. tyre faults) when it
  // has some, otherwise the generic repair-shop set.
  const { data: biz } = await (adminSupabase as any)
    .from('businesses')
    .select('business_vertical_templates(module_settings)')
    .eq('id', businessId)
    .maybeSingle()
  const fromTemplate = templateRepairDefaults(biz?.business_vertical_templates?.module_settings)
  const statuses = fromTemplate.statuses.length ? fromTemplate.statuses : GENERIC_REPAIR_STATUSES
  const faults = fromTemplate.faults.length ? fromTemplate.faults : GENERIC_REPAIR_FAULTS

  // Check if statuses already exist to avoid duplicates
  const { count: statusCount } = await db
    .from('repair_custom_statuses')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)

  if ((statusCount ?? 0) === 0) {
    await db.from('repair_custom_statuses').insert(
      statuses.map((s, i) => ({ ...s, sort_order: i + 1, business_id: businessId }))
    )
  }

  // Check if faults already exist
  const { count: faultCount } = await db
    .from('repair_faults')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)

  if ((faultCount ?? 0) === 0) {
    await db.from('repair_faults').insert(
      faults.map((name, i) => ({ name, sort_order: i + 1, business_id: businessId }))
    )
  }

  return created({ message: 'Defaults seeded successfully' })
}

export const POST = withMiddleware(seedDefaults, { requiredRole: 'business_owner' })
