import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { NextResponse, NextRequest } from 'next/server'
import type { RequestContext } from '@/backend/middleware'

async function exportProducts(req: NextRequest, ctx: RequestContext) {
  const { data, error } = await adminSupabase
    .from('products')
    .select('name, sku, barcode, selling_price, cost_price, description, is_service, is_serialized, valuation_method, categories(name), brands(name)')
    .eq('business_id', ctx.businessId)
    .eq('is_active', true)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const headers = ['name', 'sku', 'barcode', 'selling_price', 'cost_price', 'description', 'is_service', 'is_serialized', 'valuation_method', 'category', 'brand']
  const rows = (data ?? []).map((p: any) => [
    p.name, p.sku ?? '', p.barcode ?? '', p.selling_price, p.cost_price,
    (p.description ?? '').replace(/"/g, '""'),
    p.is_service ? 'true' : 'false',
    p.is_serialized ? 'true' : 'false',
    p.valuation_method ?? 'weighted_average',
    (p.categories as any)?.name ?? '',
    (p.brands as any)?.name ?? '',
  ])

  const csv = [headers, ...rows]
    .map((row) => row.map((cell: any) => `"${cell}"`).join(','))
    .join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="products-${Date.now()}.csv"`,
    },
  })
}

export const GET = withMiddleware(exportProducts, { requiredRole: 'staff' })
