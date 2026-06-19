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
  reply_to_email: z.string().email().optional().or(z.literal('')).nullable(),
  brand_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex color').optional(),
  logo_url: z.string().url().optional().or(z.literal('')).nullable(),
})

async function getHandler(_request: NextRequest, ctx: RequestContext) {
  const supabase = createAdminClient()
  try {
    const { data: business, error: err } = await supabase
      .from('businesses')
      .select('id, name, email, phone, country, currency, timezone, reply_to_email, brand_color, logo_url')
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

    // Sync logo to the main branch so invoices, booking page, etc. pick it up
    if (data.logo_url !== undefined) {
      await supabase
        .from('branches')
        .update({ logo_url: data.logo_url || null })
        .eq('business_id', ctx.auth.businessId)
        .eq('is_main', true)
    }

    return ok(business)
  } catch (err) {
    return serverError('Failed to update business settings', err)
  }
}

export const GET = withMiddleware(getHandler, { requiredRole: 'business_owner' })
export const PATCH = withMiddleware(patchHandler, { requiredRole: 'business_owner' })
