import { NextRequest } from 'next/server'
import { withMiddleware, type RequestContext } from '@/backend/middleware'
import { createAdminClient } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1).optional(),
  price_monthly: z.coerce.number().min(0).optional(),
  price_yearly: z.coerce.number().min(0).optional(),
  max_branches: z.coerce.number().int().positive().optional(),
  max_users: z.coerce.number().int().positive().optional(),
  features: z.record(z.string(), z.boolean()).optional(),
  limits: z.record(z.string(), z.union([z.number(), z.boolean(), z.null()])).optional(),
  is_active: z.boolean().optional(),
  stripe_price_id_monthly: z.string().transform((v) => v || null).nullable().optional(),
  stripe_price_id_yearly:  z.string().transform((v) => v || null).nullable().optional(),
})

async function patchHandler(
  request: NextRequest,
  ctx: RequestContext,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { data, error } = await validateBody(request, schema)
  if (error) return error
  const supabase = createAdminClient()
  try {
    const { data: plan, error: err } = await (supabase.from('plans') as any)
      .update(data)
      .eq('id', id)
      .select()
      .single()
    if (err) throw err
    return ok(plan)
  } catch (err) {
    return serverError('Failed to update plan', err)
  }
}

export const PATCH = withMiddleware(patchHandler, { requiredRole: 'super_admin', skipTenant: true })
