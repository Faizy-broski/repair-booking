import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { NextResponse, NextRequest } from 'next/server'
import type { RequestContext } from '@/backend/middleware'
import * as XLSX from 'xlsx'

async function exportProducts(req: NextRequest, ctx: RequestContext) {
  // Fetch all products with every related field
  const { data: products, error } = await adminSupabase
    .from('products')
    .select(`
      id, name, sku, barcode, imei, item_type, part_type,
      selling_price, cost_price, average_cost,
      promotional_price, minimum_price,
      description, condition, physical_location,
      is_service, is_serialized, has_variants, is_active, track_inventory,
      valuation_method, warranty_days, reorder_level,
      commission_enabled, commission_type, commission_rate,
      created_at, updated_at,
      categories(name), brands(name), suppliers(name), service_devices(name),
      inventory(quantity, low_stock_alert, branches(name))
    `)
    .eq('business_id', ctx.businessId)
    .eq('is_active', true)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (products ?? []).map((p: any) => {
    // Sum stock across all branches, or pick branch-specific if query param given
    const inventoryRows: any[] = Array.isArray(p.inventory) ? p.inventory : []
    const totalStock = inventoryRows.reduce((sum: number, i: any) => sum + (i.quantity ?? 0), 0)
    const lowestAlert = inventoryRows.reduce((min: number | null, i: any) =>
      i.low_stock_alert != null ? (min === null ? i.low_stock_alert : Math.min(min, i.low_stock_alert)) : min,
      null as number | null
    )
    // Build per-branch stock string e.g. "Main Branch: 5 | Branch 2: 3"
    const branchStock = inventoryRows
      .map((i: any) => `${i.branches?.name ?? 'Branch'}: ${i.quantity ?? 0}`)
      .join(' | ')

    return {
      'Name':                p.name,
      'SKU':                 p.sku ?? '',
      'Barcode':             p.barcode ?? '',
      'IMEI':                p.imei ?? '',
      'Item Type':           p.item_type ?? 'product',
      'Part Type':           p.part_type ?? '',
      'Category':            (p.categories as any)?.name ?? '',
      'Brand':               (p.brands as any)?.name ?? '',
      'Supplier':            (p.suppliers as any)?.name ?? '',
      'Compatible Device':   (p.service_devices as any)?.name ?? '',
      'Selling Price':       p.selling_price ?? 0,
      'Cost Price':          p.cost_price ?? 0,
      'Average Cost':        p.average_cost ?? 0,
      'Promotional Price':   p.promotional_price ?? '',
      'Minimum Price':       p.minimum_price ?? 0,
      'Total Stock':         totalStock,
      'Stock by Branch':     branchStock,
      'Low Stock Alert':     lowestAlert ?? '',
      'Reorder Level':       p.reorder_level ?? 0,
      'Valuation Method':    p.valuation_method ?? 'weighted_average',
      'Warranty (days)':     p.warranty_days ?? 0,
      'Condition':           p.condition ?? '',
      'Physical Location':   p.physical_location ?? '',
      'Is Service':          p.is_service ? 'Yes' : 'No',
      'Is Serialized':       p.is_serialized ? 'Yes' : 'No',
      'Has Variants':        p.has_variants ? 'Yes' : 'No',
      'Track Inventory':     p.track_inventory !== false ? 'Yes' : 'No',
      'Commission Enabled':  p.commission_enabled ? 'Yes' : 'No',
      'Commission Type':     p.commission_type ?? '',
      'Commission Rate':     p.commission_rate ?? 0,
      'Description':         p.description ?? '',
      'Created At':          p.created_at ? new Date(p.created_at).toLocaleDateString('en-GB') : '',
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{}])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory')

  // Auto-size columns based on content
  if (rows.length > 0) {
    const keys = Object.keys(rows[0])
    ws['!cols'] = keys.map((key) => ({
      wch: Math.max(key.length, ...rows.map((r: any) => String(r[key] ?? '').length)) + 2,
    }))
  }

  // Freeze the header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="inventory-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  })
}

export const GET = withMiddleware(exportProducts, { requiredRole: 'staff' })
