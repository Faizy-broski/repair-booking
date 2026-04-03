/**
 * GET /api/public/service-prices?subdomain=techfix&category_id=xxx&device_id=yyy
 *
 * Public endpoint — no auth required. Powers the Price Calculator widget.
 */
import { NextRequest, NextResponse } from 'next/server'
import { withPublicMiddleware } from '@/backend/middleware/public.middleware'
import { adminSupabase } from '@/backend/config/supabase'

async function getServicePrices(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl
  const subdomain  = searchParams.get('subdomain')?.trim()
  const categoryId = searchParams.get('category_id')?.trim()
  const deviceId   = searchParams.get('device_id')?.trim()

  if (!subdomain) {
    return NextResponse.json({ error: 'subdomain is required' }, { status: 400 })
  }

  // Resolve business
  const { data: biz } = await adminSupabase
    .from('businesses')
    .select('id, name, currency')
    .eq('subdomain', subdomain)
    .eq('is_active', true)
    .single()

  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // Fetch categories
  const { data: categories } = await adminSupabase
    .from('service_categories')
    .select('id, name, slug')
    .eq('business_id', biz.id)
    .eq('show_on_portal', true)
    .order('display_order')

  // Fetch problems (optionally filtered)
  let problemQuery = adminSupabase
    .from('service_problems')
    .select('id, name, price, warranty_days, device_id, category_id, service_devices(name), service_categories(name)')
    .eq('business_id', biz.id)
    .eq('show_on_portal', true)
    .order('name')

  if (categoryId) problemQuery = problemQuery.eq('category_id', categoryId)
  if (deviceId)   problemQuery = problemQuery.eq('device_id', deviceId)

  const { data: problems } = await problemQuery

  return NextResponse.json({
    data: {
      business: { name: biz.name, currency: biz.currency ?? 'GBP' },
      categories: categories ?? [],
      problems: (problems ?? []).map((p: any) => ({
        id:           p.id,
        name:         p.name,
        price:        p.price,
        warranty_days: p.warranty_days,
        device:       (p.service_devices as any)?.name ?? null,
        category:     (p.service_categories as any)?.name ?? null,
      })),
    },
  })
}

export const GET = withPublicMiddleware(getServicePrices, { rateLimit: 30 })
