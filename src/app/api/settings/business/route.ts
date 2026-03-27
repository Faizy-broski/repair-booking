import { NextRequest } from 'next/server'
import { withMiddleware, type RequestContext } from '@/backend/middleware'
import { createAdminClient } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().optional(),
  timezone: z.string().optional(),
})

async function getHandler(_request: NextRequest, ctx: RequestContext) {
  const supabase = createAdminClient()
  try {
    const { data: business, error: err } = await supabase
      .from('businesses')
      .select('id, name, email, phone, country, currency, timezone')
      .eq('id', ctx.auth.businessId)
      .single()
    if (err) throw err
    return ok(business)
  } catch (err) {
    return serverError('Failed to fetch business settings', err)
  }
}

async function patchHandler(request: NextRequest, ctx: RequestContext) {
  const { data, error } = await validateBody(request, schema)
  if (error) return error
  const supabase = createAdminClient()
  try {
    const { data: business, error: err } = await supabase
      .from('businesses')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', ctx.auth.businessId)
      .select()
      .single()
    if (err) throw err
    return ok(business)
  } catch (err) {
    return serverError('Failed to update business settings', err)
  }
}

export const GET = withMiddleware(getHandler, { requiredRole: 'business_owner' })
export const PATCH = withMiddleware(patchHandler, { requiredRole: 'business_owner' })
