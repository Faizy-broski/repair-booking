import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'

export const GET = withMiddleware(async (req, ctx) => {
  try {
    let q = adminSupabase
      .from('part_types')
      .select('*')
      .eq('business_id', ctx.businessId)
      .order('name')

    const deviceId = req.nextUrl.searchParams.get('device_id')
    if (deviceId) q = q.eq('device_id', deviceId)

    const { data, error } = await q
    if (error) throw error
    return ok(data)
  } catch (err) {
    return serverError('Failed to fetch part types', err)
  }
}, { requiredRole: 'cashier' })

export const POST = withMiddleware(async (req, ctx) => {
  try {
    const body = await req.json()
    const { data, error } = await adminSupabase
      .from('part_types')
      .insert({ name: body.name, device_id: body.device_id || null, business_id: ctx.businessId })
      .select()
      .single()
    if (error) throw error
    return ok(data)
  } catch (err) {
    return serverError('Failed to create part type', err)
  }
}, { requiredRole: 'staff' })
