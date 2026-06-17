import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'

const db = adminSupabase as any

// GET /api/categories/[id]/attributes — list attributes assigned to this category
export const GET = withMiddleware(async (req, ctx, { params }) => {
  const { id } = await params
  try {
    const { data, error } = await db
      .from('category_attributes')
      .select('attribute_id, display_order, product_attributes(id, name, product_attribute_values(id, value, display_order))')
      .eq('category_id', id)
      .eq('business_id', ctx.businessId)
      .order('display_order', { ascending: true })
    if (error) throw error
    const attrs = (data ?? []).map((row: any) => ({
      ...row.product_attributes,
      display_order: row.display_order,
      product_attribute_values: (row.product_attributes?.product_attribute_values ?? []).sort(
        (a: any, b: any) => a.display_order - b.display_order
      ),
    }))
    return ok(attrs)
  } catch (err) {
    return serverError('Failed to fetch category attributes', err)
  }
}, { requiredRole: 'cashier' })

// POST /api/categories/[id]/attributes — assign attribute to category
// body: { attribute_id: string }
export const POST = withMiddleware(async (req, ctx, { params }) => {
  const { id } = await params
  const { attribute_id } = await req.json()
  try {
    const { data: existing } = await db
      .from('category_attributes')
      .select('display_order')
      .eq('category_id', id)
      .eq('business_id', ctx.businessId)
      .order('display_order', { ascending: false })
      .limit(1)
    const nextOrder = ((existing?.[0]?.display_order ?? 0) as number) + 1

    const { data, error } = await db
      .from('category_attributes')
      .insert({ category_id: id, attribute_id, business_id: ctx.businessId, display_order: nextOrder })
      .select()
      .single()
    if (error) throw error
    return ok(data)
  } catch (err) {
    return serverError('Failed to assign attribute to category', err)
  }
}, { requiredRole: 'staff' })

// DELETE /api/categories/[id]/attributes — remove attribute from category
// body: { attribute_id: string }
export const DELETE = withMiddleware(async (req, ctx, { params }) => {
  const { id } = await params
  const { attribute_id } = await req.json()
  try {
    const { error } = await db
      .from('category_attributes')
      .delete()
      .eq('category_id', id)
      .eq('attribute_id', attribute_id)
      .eq('business_id', ctx.businessId)
    if (error) throw error
    return ok({ removed: true })
  } catch (err) {
    return serverError('Failed to remove attribute from category', err)
  }
}, { requiredRole: 'staff' })
