import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'

export const GET = withMiddleware(async (_req, ctx) => {
  try {
    // 1. Fetch Categories (Device Types)
    const { data: cats } = await adminSupabase
      .from('service_categories')
      .select('id, name')
      .eq('business_id', ctx.businessId)
      .order('display_order', { ascending: true })

    // 2. Fetch Manufacturers (Brands)
    const { data: mans } = await adminSupabase
      .from('service_manufacturers')
      .select('id, name, category_id')
      .eq('business_id', ctx.businessId)
      .order('name', { ascending: true })

    // 3. Fetch Devices (Models)
    const { data: devs } = await adminSupabase
      .from('service_devices')
      .select('id, name, manufacturer_id, category_id')
      .eq('business_id', ctx.businessId)
      .order('name', { ascending: true })

    const types  = (cats ?? []).map(c => c.name)
    const brands = (mans ?? []).map(m => m.name)
    const models = (devs ?? []).map(d => d.name)

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

    return ok({ types, brands, models, raw })
  } catch (err) {
    return serverError('Failed to fetch device catalogue', err)
  }
}, { requiredRole: 'cashier' })
