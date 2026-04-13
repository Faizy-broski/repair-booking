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
  image_url?: string      // direct image URL (JPG/PNG/WebP)
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

  // ── Prefetch all lookup tables + branches in parallel ──────────────────
  // All queries scoped to this business — no cross-tenant data leakage.
  // Branches are fetched so new products get zero-quantity inventory rows
  // seeded for every active branch, not just the one being imported into.
  const [catRes, brandRes, supplierRes, deviceRes, mfrRes, branchRes] = await Promise.all([
    adminSupabase.from('categories').select('id, name').eq('business_id', ctx.businessId),
    adminSupabase.from('brands').select('id, name').eq('business_id', ctx.businessId),
    adminSupabase.from('suppliers').select('id, name').eq('business_id', ctx.businessId),
    adminSupabase.from('service_devices').select('id, name').eq('business_id', ctx.businessId),
    adminSupabase.from('service_manufacturers').select('id, name').eq('business_id', ctx.businessId),
    adminSupabase.from('branches').select('id').eq('business_id', ctx.businessId).eq('is_active', true),
  ])

  // All active branch IDs for this business — used to seed inventory rows
  // for every branch when new products are inserted.
  const allBranchIds: string[] = (branchRes.data ?? []).map((b: { id: string }) => b.id)

  const catMap      = new Map((catRes.data ?? []).map((r) => [r.name.toLowerCase(), r.id]))
  const brandMap    = new Map((brandRes.data ?? []).map((r) => [r.name.toLowerCase(), r.id]))
  const supplierMap = new Map((supplierRes.data ?? []).map((r) => [r.name.toLowerCase(), r.id]))
  const deviceMap   = new Map((deviceRes.data ?? []).map((r) => [r.name.toLowerCase(), r.id]))
  // Manufacturer map: used by model auto-create (service_devices requires manufacturer_id NOT NULL)
  const mfrMap      = new Map((mfrRes.data ?? []).map((r) => [r.name.toLowerCase(), r.id]))

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
    // service_devices.manufacturer_id is NOT NULL, so we must ensure a manufacturer
    // exists before inserting a device. We use a lookup-or-create pattern for both
    // the manufacturer and the device to avoid UNIQUE constraint failures.
    const modelName = r.model?.trim()
    let modelId = modelName ? deviceMap.get(modelName.toLowerCase()) : null

    // Model applies to both products and parts — products like screen assemblies
    // and cases are often linked to a specific device model.
    if (modelName && !modelId) {
      // Step A: Resolve manufacturer (maps to brand in the catalogue hierarchy)
      const mfrName = brandName || 'Unknown'
      let mfrId: string | null = mfrMap.get(mfrName.toLowerCase()) ?? null

      if (!mfrId) {
        // Not in cache — insert and cache
        const { data: newMfr } = await adminSupabase
          .from('service_manufacturers')
          .insert({ business_id: ctx.businessId, name: mfrName })
          .select('id')
          .single()
        if (newMfr) {
          mfrId = newMfr.id
          mfrMap.set(mfrName.toLowerCase(), newMfr.id)
        } else {
          // Race or UNIQUE conflict — fetch the existing row
          const { data: existingMfr } = await adminSupabase
            .from('service_manufacturers')
            .select('id')
            .eq('business_id', ctx.businessId)
            .eq('name', mfrName)
            .maybeSingle()
          if (existingMfr) {
            mfrId = existingMfr.id
            mfrMap.set(mfrName.toLowerCase(), existingMfr.id)
          }
        }
      }

      // Step B: Resolve device (requires mfrId)
      if (mfrId) {
        const { data: newDevice } = await adminSupabase
          .from('service_devices')
          .insert({ business_id: ctx.businessId, name: modelName, manufacturer_id: mfrId, brand_id: brandId || null })
          .select('id')
          .single()
        if (newDevice) {
          modelId = newDevice.id
          deviceMap.set(modelName.toLowerCase(), newDevice.id)
        } else {
          // Race or UNIQUE conflict — fetch the existing row
          const { data: existingDevice } = await adminSupabase
            .from('service_devices')
            .select('id')
            .eq('business_id', ctx.businessId)
            .eq('manufacturer_id', mfrId)
            .eq('name', modelName)
            .maybeSingle()
          if (existingDevice) {
            modelId = existingDevice.id
            deviceMap.set(modelName.toLowerCase(), existingDevice.id)
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

    // Validate image_url if provided — accept only http/https URLs
    const rawImageUrl = r.image_url?.trim() || null
    if (rawImageUrl && !/^https?:\/\/.+/i.test(rawImageUrl)) {
      errors.push({ row: rowNum, message: `image_url must be a valid http/https URL (got: ${rawImageUrl})` })
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
      image_url:       rawImageUrl,
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

    // Model applies to both products and parts
    if (r.model?.trim()) {
      record.model_id = deviceMap.get(r.model.trim().toLowerCase()) ?? null
    }

    // Part type is parts-only
    if (item_type === 'part' && r.part_type?.trim()) {
      record.part_type = r.part_type.trim()
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
        // Seed a zero-quantity row for every active branch; the import branch
        // gets the actual quantity from the CSV row.
        const inventoryRows = insertedWithSku.flatMap((p) => {
          const meta = skuToMeta.get(p.sku ?? '') ?? toInsertWithSku[0]
          const branchesToSeed = allBranchIds.length > 0 ? allBranchIds : [branch_id]
          return branchesToSeed.map((bid) => ({
            branch_id:       bid,
            product_id:      p.id,
            variant_id:      null,
            quantity:        bid === branch_id ? meta.quantity : 0,
            low_stock_alert: meta.lowStockAlert ?? 5,
          }))
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
      // Seed a zero-quantity inventory row for every active branch; the
      // import branch gets the actual quantity specified in the CSV row.
      const branchesToSeed = allBranchIds.length > 0 ? allBranchIds : [branch_id]
      const inventoryRows = data.flatMap((p, idx) =>
        branchesToSeed.map((bid) => ({
          branch_id:       bid,
          product_id:      p.id,
          variant_id:      null,
          quantity:        bid === branch_id ? toInsert[idx].quantity : 0,
          low_stock_alert: toInsert[idx].lowStockAlert ?? 5,
        }))
      )
      await adminSupabase
        .from('inventory')
        .insert(inventoryRows)
    }
  }

  return NextResponse.json({ success: true, imported, updated, errors })
}

export const POST = withMiddleware(bulkImport, { requiredRole: 'branch_manager', module: 'inventory' })
