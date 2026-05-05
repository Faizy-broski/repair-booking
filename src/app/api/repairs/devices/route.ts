import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'

export const GET = withMiddleware(async (_req, ctx) => {
  try {
    // All three queries run in parallel — previously sequential (each awaited),
    // which caused cumulative latency of 3× the per-query time.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [{ data: cats }, { data: mans }, { data: devs }] = await Promise.all([
      adminSupabase
        .from('service_categories')
        .select('id, name')
        .eq('business_id', ctx.businessId)
        .order('display_order', { ascending: true }),

      (adminSupabase as any)
        .from('service_manufacturers')
        .select('id, name, category_id')
        .eq('business_id', ctx.businessId)
        .order('name', { ascending: true }),

      (adminSupabase as any)
        .from('service_devices')
        .select('id, name, manufacturer_id, category_id')
        .eq('business_id', ctx.businessId)
        .order('name', { ascending: true }),
    ]) as [
      { data: { id: string; name: string }[] | null },
      { data: { id: string; name: string; category_id: string }[] | null },
      { data: { id: string; name: string; manufacturer_id: string; category_id: string }[] | null },
    ]

    const types  = (cats ?? []).map(c => c.name)
    const brands = (mans ?? []).map(m => m.name)
    const models = (devs ?? []).map(d => d.name)

    // ID maps — used by the frontend for inline creation without extra API calls
    const brandIdMap: Record<string, string> = Object.fromEntries((mans ?? []).map(m => [m.name, m.id]))
    const typeIdMap:  Record<string, string> = Object.fromEntries((cats ?? []).map(c => [c.name, c.id]))

    // Construct the "raw" list that the frontend expects for filtering
    const raw = (devs ?? []).map(d => {
      const brand = mans?.find(m => m.id === d.manufacturer_id)
      const type  = cats?.find(c => c.id === d.category_id)
      return {
        device_type: type?.name ?? null,
        device_brand: brand?.name ?? null,
        device_model: d.name
      }
    })

    return ok({ types, brands, models, raw, brandIdMap, typeIdMap })
  } catch (err) {
    return serverError('Failed to fetch device catalogue', err)
  }
}, { requiredRole: 'cashier' })
