import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'

export const GET = withMiddleware(async (req, ctx) => {
  try {
    let q = adminSupabase
      .from('brands')
      .select('*')
      .eq('business_id', ctx.businessId)
      .order('name')

    const categoryId = req.nextUrl.searchParams.get('category_id')
    if (categoryId) q = q.eq('category_id', categoryId)

    const { data, error } = await q
    if (error) throw error
    return ok(data)
  } catch (err) {
    return serverError('Failed to fetch brands', err)
  }
}, { requiredRole: 'cashier' })

export const POST = withMiddleware(async (req, ctx) => {
  try {
    const body = await req.json()
    const { data, error } = await adminSupabase
      .from('brands')
      .insert({ ...body, business_id: ctx.businessId })
      .select()
      .single()
    if (error) throw error
    return ok(data)
  } catch (err) {
    return serverError('Failed to create brand', err)
  }
}, { requiredRole: 'staff' })
