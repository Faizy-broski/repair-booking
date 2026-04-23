import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'

export const GET = withMiddleware(async (_req, ctx) => {
  try {
    const { data: branches } = await adminSupabase
      .from('branches')
      .select('id')
      .eq('business_id', ctx.businessId)

    const branchIds = (branches ?? []).map((b) => b.id)

    const { data, error } = await adminSupabase
      .from('repairs')
      .select('device_type, device_brand, device_model')
      .in('branch_id', branchIds)

    if (error) throw error

    const raw = (data ?? []).filter((d) => d.device_type || d.device_brand || d.device_model)
    const types  = [...new Set(raw.map((d) => d.device_type).filter(Boolean)  as string[])]
    const brands = [...new Set(raw.map((d) => d.device_brand).filter(Boolean) as string[])]
    const models = [...new Set(raw.map((d) => d.device_model).filter(Boolean) as string[])]

    return ok({ types, brands, models, raw })
  } catch (err) {
    return serverError('Failed to fetch device catalogue', err)
  }
}, { requiredRole: 'cashier' })
