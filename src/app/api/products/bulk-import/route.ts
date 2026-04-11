import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { NextResponse, NextRequest } from 'next/server'
import type { RequestContext } from '@/backend/middleware'

interface BulkRow {
  name: string
  sku?: string
  barcode?: string
  selling_price?: string | number
  cost_price?: string | number
  description?: string
  category?: string       // products: category name
  device_type?: string    // parts: device type (maps to category_id)
  brand?: string
  supplier?: string
  model?: string          // service_device name (parts)
  part_type?: string      // text part type (parts)
  valuation_method?: string
  is_service?: string | boolean
  is_serialized?: string | boolean
  track_inventory?: string | boolean
  quantity?: string | number
  low_stock_alert?: string | number
  reorder_level?: string | number
  condition?: string
  warranty_days?: string | number
  [key: string]: unknown
}

interface RequestBody {
  rows: BulkRow[]
  item_type?: 'product' | 'part'
  branch_id: string
}

function parseBool(v: unknown): boolean | null {
  if (v === true || v === 'true' || v === '1' || v === 'yes' || v === 'TRUE' || v === 'YES') return true
  if (v === false || v === 'false' || v === '0' || v === 'no' || v === 'FALSE' || v === 'NO') return false
  return null
}

function parseNum(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = parseFloat(String(v))
  return isNaN(n) ? null : n
}

function parseIntVal(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = parseInt(String(v), 10)
  return isNaN(n) ? null : n
}

async function bulkImport(req: NextRequest, ctx: RequestContext) {
  const body = (await req.json()) as RequestBody
  const { rows, item_type = 'product', branch_id } = body

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
  }
  if (!branch_id) {
    return NextResponse.json({ error: 'branch_id is required' }, { status: 400 })
  }

  // ── Prefetch all lookup tables in parallel ──────────────────────────────
  const [catRes, brandRes, supplierRes, deviceRes] = await Promise.all([
    adminSupabase.from('categories').select('id, name').eq('business_id', ctx.businessId),
    adminSupabase.from('brands').select('id, name').eq('business_id', ctx.businessId),
    adminSupabase.from('suppliers').select('id, name').eq('business_id', ctx.businessId),
    adminSupabase.from('service_devices').select('id, name'),
  ])

  const catMap      = new Map((catRes.data ?? []).map((r) => [r.name.toLowerCase(), r.id]))
  const brandMap    = new Map((brandRes.data ?? []).map((r) => [r.name.toLowerCase(), r.id]))
  const supplierMap = new Map((supplierRes.data ?? []).map((r) => [r.name.toLowerCase(), r.id]))
  const deviceMap   = new Map((deviceRes.data ?? []).map((r) => [r.name.toLowerCase(), r.id]))

  // ── Auto-create Missing References ──────────────────────────────────────
  for (const r of rows) {
    const isPart = item_type === 'part'
    
    // 1. Category (Device Type)
    const catName = isPart ? (r.device_type?.trim() || r.category?.trim()) : r.category?.trim()
    let catId = catName ? catMap.get(catName.toLowerCase()) : null

    if (catName && !catId) {
      const { data } = await adminSupabase.from('categories')
        // Safe bet: if categories doesn't support 'type', it will ignore it or we should just omit it. The default category schema doesn't have 'type'.
        .insert({ business_id: ctx.businessId, name: catName })
        .select('id').single()
      if (data) {
        catId = data.id
        catMap.set(catName.toLowerCase(), data.id)
      }
    }

    // 2. Brand
    const brandName = r.brand?.trim()
    let brandId = brandName ? brandMap.get(brandName.toLowerCase()) : null

    if (brandName && !brandId) {
      const { data } = await adminSupabase.from('brands')
        .insert({ business_id: ctx.businessId, name: brandName, category_id: catId || null })
        .select('id').single()
      if (data) {
        brandId = data.id
        brandMap.set(brandName.toLowerCase(), data.id)
      }
    }

    // 3. Model (service_devices)
    const modelName = r.model?.trim()
    let modelId = modelName ? deviceMap.get(modelName.toLowerCase()) : null

    if (isPart && modelName && !modelId) {
      const { data, error } = await adminSupabase.from('service_devices')
        .insert({ business_id: ctx.businessId, name: modelName, brand_id: brandId || null })
        .select('id').single()
      if (data) {
        modelId = data.id
        deviceMap.set(modelName.toLowerCase(), data.id)
      } else if (error && error.code === '23502') { 
        // Fallback if 'manufacturer_id' is NOT NULL constraint
        const { data: mfg } = await adminSupabase.from('service_manufacturers')
          .insert({ business_id: ctx.businessId, name: brandName || 'Unknown Manufacturer' })
          .select('id').single()
        if (mfg) {
          const { data: retryData } = await adminSupabase.from('service_devices')
            .insert({ business_id: ctx.businessId, name: modelName, brand_id: brandId || null, manufacturer_id: mfg.id })
            .select('id').single()
          if (retryData) {
            modelId = retryData.id
            deviceMap.set(modelName.toLowerCase(), retryData.id)
          }
        }
      }
    }
    
    // 4. Supplier
    const supName = r.supplier?.trim()
    let supId = supName ? supplierMap.get(supName.toLowerCase()) : null

    if (supName && !supId) {
      const { data } = await adminSupabase.from('suppliers')
        .insert({ business_id: ctx.businessId, name: supName })
        .select('id').single()
      if (data) {
        supId = data.id
        supplierMap.set(supName.toLowerCase(), data.id)
      }
    }
  }

  // ── Parse rows ──────────────────────────────────────────────────────────
  const toUpsert: Array<{ record: Record<string, unknown>; quantity: number; lowStockAlert: number | null }> = []
  const toInsert: Array<{ record: Record<string, unknown>; quantity: number; lowStockAlert: number | null }> = []
  const errors: Array<{ row: number; message: string }> = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const rowNum = i + 2 // account for header row

    const name = r.name?.trim()
    if (!name) {
      errors.push({ row: rowNum, message: 'name is required' })
      continue
    }

    const sellingPrice = parseNum(r.selling_price)
    if (sellingPrice === null || sellingPrice < 0) {
      errors.push({ row: rowNum, message: 'selling_price must be a non-negative number' })
      continue
    }

    const record: Record<string, unknown> = {
      business_id:     ctx.businessId,
      name,
      sku:             r.sku?.trim() || null,
      barcode:         r.barcode?.trim() || null,
      selling_price:   sellingPrice,
      cost_price:      parseNum(r.cost_price) ?? 0,
      description:     r.description?.trim() || null,
      item_type,
      is_service:      false,
      track_inventory: true,
      is_active:       true,
    }

    // Resolve names → IDs
    // For parts use device_type column; for products use category column
    const categoryName = item_type === 'part'
      ? (r.device_type?.trim() || r.category?.trim())
      : r.category?.trim()
    if (categoryName) {
      record.category_id = catMap.get(categoryName.toLowerCase()) ?? null
    }
    if (r.brand?.trim()) {
      record.brand_id = brandMap.get(r.brand.trim().toLowerCase()) ?? null
    }
    if (r.supplier?.trim()) {
      record.supplier_id = supplierMap.get(r.supplier.trim().toLowerCase()) ?? null
    }

    // Parts-specific
    if (item_type === 'part') {
      if (r.model?.trim()) {
        record.model_id = deviceMap.get(r.model.trim().toLowerCase()) ?? null
      }
      if (r.part_type?.trim()) {
        record.part_type = r.part_type.trim()
      }
    }

    const quantity      = parseNum(r.quantity) ?? 0
    const lowStockAlert = parseNum(r.low_stock_alert)

    // Only route to upsert when SKU is a non-empty string — blank SKUs have no
    // unique constraint and would cause an ON CONFLICT error.
    const hasSku = typeof record.sku === 'string' && record.sku.trim().length > 0
    if (hasSku) {
      toUpsert.push({ record, quantity, lowStockAlert })
    } else {
      record.sku = null // normalise empty string → null
      toInsert.push({ record, quantity, lowStockAlert })
    }
  }

  let imported = 0
  let updated  = 0

  // ── Handle rows with SKU: pre-fetch existing to decide update vs insert ─
  if (toUpsert.length > 0) {
    const skus = toUpsert.map((x) => x.record.sku as string)

    // Fetch all existing products for this business that match any of the SKUs.
    // This avoids any ON CONFLICT requirement — we do the split manually.
    const { data: existingProducts, error: fetchError } = await adminSupabase
      .from('products')
      .select('id, sku')
      .eq('business_id', ctx.businessId)
      .in('sku', skus)
    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })

    const existingSkuMap = new Map((existingProducts ?? []).map((p) => [p.sku as string, p.id as string]))

    const toUpdate: typeof toUpsert = []
    const toInsertWithSku: typeof toUpsert = []

    for (const item of toUpsert) {
      if (existingSkuMap.has(item.record.sku as string)) {
        toUpdate.push(item)
      } else {
        toInsertWithSku.push(item)
      }
    }

    // ── Update existing products one-by-one ────────────────────────────
    const updatedIds: string[] = []
    for (const item of toUpdate) {
      const existingId = existingSkuMap.get(item.record.sku as string)!
      const { error: updateError } = await adminSupabase
        .from('products')
        .update(item.record)
        .eq('id', existingId)
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
      updatedIds.push(existingId)
    }
    updated = updatedIds.length

    if (updatedIds.length > 0) {
      const skuToMeta = new Map(toUpdate.map((x) => [x.record.sku as string, x]))
      const inventoryRows = updatedIds.map((id) => {
        const sku = [...existingSkuMap.entries()].find(([, v]) => v === id)?.[0] ?? ''
        const meta = skuToMeta.get(sku) ?? toUpdate[0]
        return {
          branch_id,
          product_id:      id,
          variant_id:      null,
          quantity:        meta.quantity,
          low_stock_alert: meta.lowStockAlert ?? 5,
        }
      })
      await adminSupabase
        .from('inventory')
        .delete()
        .eq('branch_id', branch_id)
        .in('product_id', updatedIds)
        .is('variant_id', null)
      await adminSupabase.from('inventory').insert(inventoryRows)
    }

    // ── Insert new products that have a SKU ────────────────────────────
    if (toInsertWithSku.length > 0) {
      const { data: insertedWithSku, error: insertSkuError } = await adminSupabase
        .from('products')
        .insert(toInsertWithSku.map((x) => x.record))
        .select('id, sku')
      if (insertSkuError) return NextResponse.json({ error: insertSkuError.message }, { status: 500 })

      imported += insertedWithSku?.length ?? 0

      if (insertedWithSku && insertedWithSku.length > 0) {
        const skuToMeta = new Map(toInsertWithSku.map((x) => [x.record.sku as string, x]))
        const inventoryRows = insertedWithSku.map((p) => {
          const meta = skuToMeta.get(p.sku ?? '') ?? toInsertWithSku[0]
          return {
            branch_id,
            product_id:      p.id,
            variant_id:      null,
            quantity:        meta.quantity,
            low_stock_alert: meta.lowStockAlert ?? 5,
          }
        })
        await adminSupabase.from('inventory').insert(inventoryRows)
      }
    }
  }

  // ── Insert products without SKU ─────────────────────────────────────────
  if (toInsert.length > 0) {
    const { data, error } = await adminSupabase
      .from('products')
      .insert(toInsert.map((x) => x.record))
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    imported = data?.length ?? 0

    if (data && data.length > 0) {
      const inventoryRows = data.map((p, idx) => ({
        branch_id,
        product_id:      p.id,
        variant_id:      null,
        quantity:        toInsert[idx].quantity,
        low_stock_alert: toInsert[idx].lowStockAlert ?? 5,
      }))
      await adminSupabase
        .from('inventory')
        .delete()
        .eq('branch_id', branch_id)
        .in('product_id', data.map((p) => p.id))
        .is('variant_id', null)

      await adminSupabase
        .from('inventory')
        .insert(inventoryRows)
    }
  }

  return NextResponse.json({ success: true, imported, updated, errors })
}

export const POST = withMiddleware(bulkImport, { requiredRole: 'branch_manager', module: 'inventory' })
