import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1),
  sort_order: z.number().default(0),
})

export const GET = withMiddleware(async (_req, ctx) => {
  try {
    const { data, error } = await (adminSupabase as any)
      .from('repair_faults')
      .select('*')
      .eq('business_id', ctx.businessId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error
    return ok(data)
  } catch (err) {
    return serverError('Failed to fetch faults', err)
  }
}, { requiredRole: 'cashier' })

export const POST = withMiddleware(async (req, ctx) => {
  const { data, error } = await validateBody(req, schema)
  if (error) return error
  try {
    const { data: row, error: dbErr } = await (adminSupabase as any)
      .from('repair_faults')
      .insert({ ...data, business_id: ctx.businessId })
      .select()
      .single()
    if (dbErr) throw dbErr
    return ok(row)
  } catch (err) {
    return serverError('Failed to create fault', err)
  }
}, { requiredRole: 'cashier' })
