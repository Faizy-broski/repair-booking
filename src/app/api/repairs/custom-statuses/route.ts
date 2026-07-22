import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1),
  color: z.string().default('#09d6f1'),
  sort_order: z.number().default(0),
  is_terminal: z.boolean().default(false),
})

export const GET = withMiddleware(async (_req, ctx) => {
  try {
    const { data, error } = await (adminSupabase as any)
      .from('repair_custom_statuses')
      .select('*')
      .eq('business_id', ctx.businessId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error
    return ok(data)
  } catch (err) {
    return serverError('Failed to fetch statuses', err)
  }
}, { requiredRole: 'cashier' })

export const POST = withMiddleware(async (req, ctx) => {
  const { data, error } = await validateBody(req, schema)
  if (error) return error
  try {
    const { data: row, error: dbErr } = await (adminSupabase as any)
      .from('repair_custom_statuses')
      .insert({ ...data, business_id: ctx.businessId })
      .select()
      .single()
    if (dbErr) throw dbErr
    return ok(row)
  } catch (err) {
    return serverError('Failed to create status', err)
  }
}, { requiredRole: 'branch_manager' })
