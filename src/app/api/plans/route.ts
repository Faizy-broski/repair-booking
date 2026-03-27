import { NextRequest } from 'next/server'
import { withMiddleware, type RequestContext } from '@/backend/middleware'
import { createAdminClient } from '@/backend/config/supabase'
import { ok, created, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1),
  price_monthly: z.coerce.number().min(0),
  price_yearly: z.coerce.number().min(0).optional().default(0),
  max_branches: z.coerce.number().int().positive(),
  max_users: z.coerce.number().int().positive(),
  features: z.record(z.string(), z.boolean()).default({}),
  limits: z.record(z.string(), z.union([z.number(), z.boolean(), z.null()])).default({}),
  stripe_price_id_monthly: z.string().transform((v) => v || null).nullable().optional(),
  stripe_price_id_yearly:  z.string().transform((v) => v || null).nullable().optional(),
})

async function listHandler(request: NextRequest) {
  const supabase = createAdminClient()
  try {
    const { data, error } = await supabase.from('plans').select('*').order('price_monthly')
    if (error) throw error
    return ok(data)
  } catch (err) {
    return serverError('Failed to fetch plans', err)
  }
}

async function createHandler(request: NextRequest, ctx: RequestContext) {
  const { data, error } = await validateBody(request, schema)
  if (error) return error
  const supabase = createAdminClient()
  try {
    const { data: plan, error: err } = await (supabase.from('plans') as any).insert(data).select().single()
    if (err) throw err
    return created(plan)
  } catch (err) {
    return serverError('Failed to create plan', err)
  }
}

export const GET  = withMiddleware(listHandler,   { requiredRole: 'super_admin', skipTenant: true })
export const POST = withMiddleware(createHandler, { requiredRole: 'super_admin', skipTenant: true })
