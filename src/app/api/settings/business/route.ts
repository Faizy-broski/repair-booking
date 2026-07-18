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
  city: z.string().optional(),
  address: z.string().optional(),
  website: z.string().optional(),
  whatsapp: z.string().optional(),
  mapsUrl: z.string().optional(),
  currency: z.string().optional(),
  timezone: z.string().optional(),
  reply_to_email: z.string().email().optional().or(z.literal('')).nullable(),
  brand_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex color').optional(),
  logo_url: z.string().url().optional().or(z.literal('')).nullable(),
  delete_pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4–6 digits').optional().nullable(),
})

async function getHandler(_request: NextRequest, ctx: RequestContext) {
  const supabase = createAdminClient()
  try {
    const { data: business, error: err } = await supabase
      .from('businesses')
      .select('id, name, subdomain, email, phone, country, city, address, website, whatsapp, maps_url, currency, timezone, reply_to_email, brand_color, logo_url, delete_pin')
      .eq('id', ctx.businessId)
      .single()
    if (err) throw err
    // Never expose the raw PIN to the client — return a boolean flag only
    const { delete_pin, ...rest } = business as any
    return ok({ ...rest, has_delete_pin: !!delete_pin })
  } catch (err) {
    return serverError('Failed to fetch business settings', err)
  }
}

async function patchHandler(request: NextRequest, ctx: RequestContext) {
  const { data, error } = await validateBody(request, schema)
  if (error) return error
  const { mapsUrl, ...rest } = data
  const supabase = createAdminClient()
  try {
    const { data: business, error: err } = await supabase
      .from('businesses')
      .update({ ...rest, ...(mapsUrl !== undefined ? { maps_url: mapsUrl } : {}), updated_at: new Date().toISOString() })
      .eq('id', ctx.businessId)
      .select()
      .single()
    if (err) throw err

    // Sync logo to the main branch so invoices, booking page, etc. pick it up
    if (data.logo_url !== undefined) {
      await supabase
        .from('branches')
        .update({ logo_url: data.logo_url || null })
        .eq('business_id', ctx.businessId)
        .eq('is_main', true)
    }

    return ok(business)
  } catch (err) {
    return serverError('Failed to update business settings', err)
  }
}

export const GET = withMiddleware(getHandler, { requiredRole: 'cashier' })
export const PATCH = withMiddleware(patchHandler, { requiredRole: 'business_owner' })
