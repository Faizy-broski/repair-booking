import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'

export const DELETE = withMiddleware(async (req, ctx, { params }) => {
  const { id } = await params
  try {
    const { error } = await adminSupabase
      .from('part_types')
      .delete()
      .eq('id', id)
      .eq('business_id', ctx.businessId)
    if (error) throw error
    return ok({ deleted: true })
  } catch (err) {
    return serverError('Failed to delete part type', err)
  }
}, { requiredRole: 'branch_manager' })

export const PUT = withMiddleware(async (req, ctx, { params }) => {
  const { id } = await params
  const body = await req.json()
  try {
    const update: Record<string, unknown> = { name: body.name }
    if (body.device_id !== undefined) update.device_id = body.device_id || null
    const { data, error } = await adminSupabase
      .from('part_types')
      .update(update)
      .eq('id', id)
      .eq('business_id', ctx.businessId)
      .select()
      .single()
    if (error) throw error
    return ok(data)
  } catch (err) {
    return serverError('Failed to update part type', err)
  }
}, { requiredRole: 'branch_manager' })
