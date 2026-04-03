import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'

export const GET = withMiddleware(async (req, ctx) => {
  try {
    const { searchParams } = req.nextUrl
    const parentIdParam = searchParams.get('parent_id')

    let q = adminSupabase
      .from('categories')
      .select('*')
      .eq('business_id', ctx.businessId)
      .order('name')

    if (parentIdParam === 'null') {
      q = q.is('parent_id', null)
    } else if (parentIdParam) {
      q = q.eq('parent_id', parentIdParam)
    }

    const { data, error } = await q
    if (error) throw error
    return ok(data)
  } catch (err) {
    return serverError('Failed to fetch categories', err)
  }
}, { requiredRole: 'cashier' })

export const POST = withMiddleware(async (req, ctx) => {
  try {
    const body = await req.json()
    const { data, error } = await adminSupabase
      .from('categories')
      .insert({ ...body, business_id: ctx.businessId })
      .select()
      .single()
    if (error) throw error
    return ok(data)
  } catch (err) {
    return serverError('Failed to create category', err)
  }
}, { requiredRole: 'staff' })
