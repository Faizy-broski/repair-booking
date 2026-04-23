import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  sort_order: z.number().optional(),
})

export const PATCH = withMiddleware(async (req, ctx, { params }) => {
  const { id } = await params
  const { data, error } = await validateBody(req, schema)
  if (error) return error
  try {
    const { data: row, error: dbErr } = await adminSupabase
      .from('repair_custom_statuses')
      .update(data)
      .eq('id', id)
      .eq('business_id', ctx.businessId)
      .select()
      .single()
    if (dbErr) throw dbErr
    return ok(row)
  } catch (err) {
    return serverError('Failed to update status', err)
  }
}, { requiredRole: 'branch_manager' })

export const DELETE = withMiddleware(async (_req, ctx, { params }) => {
  const { id } = await params
  try {
    const { error } = await adminSupabase
      .from('repair_custom_statuses')
      .delete()
      .eq('id', id)
      .eq('business_id', ctx.businessId)
    if (error) throw error
    return ok({ deleted: true })
  } catch (err) {
    return serverError('Failed to delete status', err)
  }
}, { requiredRole: 'branch_manager' })
