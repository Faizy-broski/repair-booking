import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables, UpdateTables } from '@/types/database'
import { escapeIlike } from '@/backend/utils/search'

// product_history and product_group_pricing are from migration 033 — use `as any`
const db = adminSupabase as any

export const ProductService = {
  // Live FIFO/LIFO cost batches for a product — lets the UI show what the
  // backend's inventory_cost_layers table actually contains, oldest first
  // (the order FIFO consumption would draw from them).
  async getCostLayers(productId: string, branchId?: string) {
    let q = db
      .from('inventory_cost_layers')
      .select('id, quantity, quantity_received, depleted_at, unit_cost, selling_price, received_at, source_type, branch_id, variant_id')
      .eq('product_id', productId)
      .order('received_at', { ascending: true })
    if (branchId) q = q.eq('branch_id', branchId)
    const { data, error } = await q
    if (error) throw error
    return data ?? []
  },

  // ── Stock batch CRUD (FIFO products only — see migration 146) ───────────
  // Each wraps a SECURITY DEFINER RPC that atomically locks/updates
  // `inventory`, writes the batch row, logs a stock_movements adjustment,
  // and re-syncs the product's/variant's flat selling_price to the oldest
  // remaining batch so POS/lists keep reading a single price column.
  async createCostLayer(params: {
    branchId: string; productId: string; variantId: string | null
    quantity: number; unitCost: number; sellingPrice: number | null
    note?: string; userId: string
  }) {
    const { data, error } = await (db.rpc as any)('add_cost_layer_batch', {
      p_branch_id: params.branchId,
      p_product_id: params.productId,
      p_variant_id: params.variantId,
      p_quantity: params.quantity,
      p_unit_cost: params.unitCost,
      p_selling_price: params.sellingPrice,
      p_note: params.note ?? null,
      p_user_id: params.userId,
    })
    if (error) throw error
    return data
  },

  async updateCostLayer(params: {
    layerId: string; quantity: number; unitCost: number
    sellingPrice: number | null; userId: string
  }) {
    const { error } = await (db.rpc as any)('update_cost_layer_batch', {
      p_layer_id: params.layerId,
      p_quantity: params.quantity,
      p_unit_cost: params.unitCost,
      p_selling_price: params.sellingPrice,
      p_user_id: params.userId,
    })
    if (error) throw error
  },

  async deleteCostLayer(layerId: string, userId: string) {
    const { error } = await (db.rpc as any)('delete_cost_layer_batch', {
      p_layer_id: layerId,
      p_user_id: userId,
    })
    if (error) throw error
  },

  // One query, one pass — the JS equivalent of a CTE + window function, since
  // the Supabase query builder can't express those directly. Rows come back
  // ordered oldest-first per branch; the first row seen for a product+variant
  // is its oldest open batch, i.e. the one FIFO will consume next. Used
  // everywhere a "stock value"/"unit cost" figure needs to reflect real
  // batches instead of the single mutable products.cost_price scalar.
  // Keyed by `${product_id}::${variant_id ?? 'null'}` so each variant's
  // batches are valued independently — a plain product_id key would blend
  // every variant's cost into one figure. A product/variant with no rows
  // here (never restocked since the FIFO rollout, or never variant-scoped)
  // simply won't appear in the map — callers fall back to cost_price for
  // those, unchanged from before.
  async getBatchValuationByBranch(branchId: string) {
    const { data, error } = await db
      .from('inventory_cost_layers')
      .select('product_id, variant_id, quantity, unit_cost')
      .eq('branch_id', branchId)
      .order('received_at', { ascending: true })
    if (error) throw error

    const map = new Map<string, { totalValue: number; totalQty: number; nextUnitCost: number }>()
    for (const layer of (data ?? []) as any[]) {
      const key = `${layer.product_id}::${layer.variant_id ?? 'null'}`
      const value = layer.quantity * layer.unit_cost
      const existing = map.get(key)
      if (existing) {
        existing.totalValue += value
        existing.totalQty += layer.quantity
      } else {
        map.set(key, { totalValue: value, totalQty: layer.quantity, nextUnitCost: layer.unit_cost })
      }
    }
    return map
  },

  // ── Quantity-scoped discount (retail-store template) ────────────────────
  // Mirrors the FIFO cost-layer pattern (a per-branch, per-product lot with a
  // decrementing quantity) but for SELLING price instead of cost price. Only
  // one 'active' row per (product_id, branch_id) — enforced by a partial
  // unique index in migration 137.

  // variantId omitted/undefined targets the base product (variant_id IS
  // NULL); a product with has_variants=true always passes a specific
  // variantId instead — the two never mix for the same product (see plan).
  async getActiveDiscount(productId: string, branchId: string, variantId?: string) {
    let q = db
      .from('product_discount_allocations')
      .select('id, variant_id, discount_price, quantity_total, quantity_remaining, status, created_at')
      .eq('product_id', productId)
      .eq('branch_id', branchId)
      .eq('status', 'active')
    q = variantId ? q.eq('variant_id', variantId) : q.is('variant_id', null)
    const { data, error } = await q.maybeSingle()
    if (error) throw error
    return data ?? null
  },

  async setDiscount(productId: string, branchId: string, quantity: number, discountPrice: number, userId?: string, variantId?: string) {
    let invQ = adminSupabase
      .from('inventory')
      .select('quantity')
      .eq('product_id', productId)
      .eq('branch_id', branchId)
    invQ = variantId ? invQ.eq('variant_id', variantId) : invQ.is('variant_id', null)
    const { data: inv } = await invQ.maybeSingle()
    const onHand = (inv as any)?.quantity ?? 0
    if (quantity > onHand) throw new Error(`Cannot discount ${quantity} units — only ${onHand} on hand`)

    const existing = await ProductService.getActiveDiscount(productId, branchId, variantId)
    if (existing) {
      const alreadySold = existing.quantity_total - existing.quantity_remaining
      if (quantity < alreadySold) {
        throw new Error(`Cannot reduce discount quantity below ${alreadySold} — that many units have already sold at the discount price`)
      }
      const { data, error } = await db
        .from('product_discount_allocations')
        .update({ discount_price: discountPrice, quantity_total: quantity, quantity_remaining: quantity - alreadySold })
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      return data
    }

    const { data, error } = await db
      .from('product_discount_allocations')
      .insert({
        product_id: productId, branch_id: branchId, variant_id: variantId ?? null,
        discount_price: discountPrice, quantity_total: quantity, quantity_remaining: quantity,
        created_by: userId ?? null,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async endDiscount(productId: string, branchId: string, variantId?: string) {
    let q = db
      .from('product_discount_allocations')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('product_id', productId)
      .eq('branch_id', branchId)
      .eq('status', 'active')
    q = variantId ? q.eq('variant_id', variantId) : q.is('variant_id', null)
    const { error } = await q
    if (error) throw error
  },

  async list(businessId: string, params: {
    page?: number; limit?: number; search?: string; categoryId?: string
    branchId?: string; includeInactive?: boolean; includeDrafts?: boolean
    brandId?: string; supplierId?: string; valuation?: string
    hideOutOfStock?: boolean; itemType?: string; modelId?: string; partType?: string
    barcode?: string; lowStockOnly?: boolean // exact match on barcode or sku — used by scanner (not ilike)
  }) {
    const { page = 1, limit = 20, search, categoryId, branchId, includeInactive, includeDrafts,
            brandId, supplierId, valuation, hideOutOfStock, itemType, modelId, partType,
            barcode, lowStockOnly } = params

    const inventorySelect = branchId
      ? `*, categories(name), brands(name), inventory!left(quantity, low_stock_alert, branch_id, variant_id), product_variants(id), suppliers(name), service_devices(name), branch_products!inner(is_enabled)`
      : `*, categories(name), brands(name), product_variants(id), suppliers(name), service_devices(name)`

    let q = db
      .from('products')
      .select(inventorySelect, { count: 'exact' })
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (!includeInactive) q = q.eq('is_active', true)
    if (!includeDrafts) q = q.eq('is_draft', false)

    // When listing for a specific branch, only return products that are enabled
    // in that branch's catalog via the branch_products join.
    if (branchId) {
      q = q
        .eq('branch_products.branch_id', branchId)
        .eq('branch_products.is_enabled', true)
    }
    if (barcode) {
      // Exact identifier match for scanner — barcode takes priority over search
      // We must wrap the barcode in double quotes so PostgREST treats numeric barcodes as text, avoiding casting errors.
      q = q.or(`barcode.eq."${barcode}",sku.eq."${barcode}"`)
    } else if (search) {
      const term = `%${escapeIlike(search)}%`
      q = q.or(`name.ilike.${term},sku.ilike.${term},barcode.ilike.${term},imei.ilike.${term}`)
    }
    if (categoryId) q = q.eq('category_id', categoryId)
    if (brandId) q = q.eq('brand_id', brandId)
    if (supplierId) q = q.eq('supplier_id', supplierId)
    if (valuation) q = q.eq('valuation_method', valuation)
    if (itemType) q = q.eq('item_type', itemType)
    if (modelId) q = q.eq('model_id', modelId)
    if (partType) q = q.eq('part_type', partType)

    const { data, error, count } = await q
    if (error) throw error

    // FIFO batch costs, keyed by product_id — lets the "Unit Cost" column show
    // the real next-to-sell batch cost instead of the raw (possibly stale)
    // cost_price scalar. Product-level only (see getBatchValuationByBranch);
    // variant products fall back to their own cost_price, unchanged.
    const batchValuation = branchId ? await ProductService.getBatchValuationByBranch(branchId) : new Map()

    // Active discount allocations, keyed by product_id — one query for the
    // whole page instead of one per row. discountMap carries the full detail
    // for base-product-level rows (variant_id NULL); productsWithVariantDiscount
    // is just a "does ANY variant of this product have an active discount"
    // flag, used to show a SALE indicator on the card even though the exact
    // price/quantity varies per variant (shown in the variant popover instead).
    const discountMap = new Map<string, { discount_price: number; quantity_remaining: number }>()
    const productsWithVariantDiscount = new Set<string>()
    if (branchId) {
      const { data: discounts } = await db
        .from('product_discount_allocations')
        .select('product_id, variant_id, discount_price, quantity_remaining')
        .eq('branch_id', branchId)
        .eq('status', 'active')
      for (const d of (discounts ?? []) as any[]) {
        if (d.variant_id) {
          productsWithVariantDiscount.add(d.product_id)
        } else {
          discountMap.set(d.product_id, { discount_price: d.discount_price, quantity_remaining: d.quantity_remaining })
        }
      }
    }

    let enriched = (data ?? []).map((p: Record<string, unknown>) => {
      const variantCount = Array.isArray(p.product_variants) ? (p.product_variants as unknown[]).length : 0
      if (!branchId || !Array.isArray(p.inventory)) {
        return { ...p, variant_count: variantCount, product_variants: undefined }
      }
      const branchInv = (p.inventory as Array<{ branch_id: string; quantity: number; low_stock_alert: number | null; variant_id: string | null }>)
        .find((i) => i.branch_id === branchId && i.variant_id === null)

      const hasLowStockVariant = p.has_variants
        ? (p.inventory as Array<any>).some(i => i.branch_id === branchId && i.variant_id !== null && i.quantity <= (i.low_stock_alert ?? 5))
        : false;

      const on_hand = branchInv?.quantity ?? 0
      const batch = !p.has_variants ? batchValuation.get(`${p.id}::null`) : undefined
      const activeDiscount = !p.has_variants ? discountMap.get(p.id as string) : undefined
      return {
        ...p, on_hand, low_stock_alert: branchInv?.low_stock_alert ?? null, has_low_stock_variant: hasLowStockVariant,
        inventory: undefined, branch_products: undefined, variant_count: variantCount, product_variants: undefined,
        next_batch_cost: batch ? batch.nextUnitCost : null,
        active_discount: activeDiscount ?? null,
        has_variant_discount: !!p.has_variants && productsWithVariantDiscount.has(p.id as string),
      }
    })

    if (hideOutOfStock) {
      enriched = enriched.filter((p: any) => p.is_service || (p.on_hand ?? 0) > 0 || p.has_variants)
    }

    if (lowStockOnly) {
      enriched = enriched.filter((p: any) => {
        if (p.is_service) return false;
        if (p.has_variants) return p.has_low_stock_variant;
        return (p.on_hand ?? 0) <= (p.low_stock_alert ?? 5);
      })
    }

    return { data: enriched, count }
  },

  async getById(id: string, businessId: string, branchId?: string) {
    const select = branchId
      ? `*, product_variants(*), categories(name), brands(name), suppliers(name, id), service_devices(name, id), inventory!left(quantity, low_stock_alert, branch_id)`
      : `*, product_variants(*), categories(name), brands(name), suppliers(name, id), service_devices(name, id)`
    const { data, error } = await db
      .from('products')
      .select(select)
      .eq('id', id)
      .eq('business_id', businessId)
      .single()
    if (error) throw error
    if (branchId && data && Array.isArray(data.inventory)) {
      const branchInv = (data.inventory as Array<{ branch_id: string; quantity: number; low_stock_alert: number | null }>)
        .find((i: any) => i.branch_id === branchId)
      const { inventory: _inv, ...rest } = data
      return { ...rest, on_hand: branchInv?.quantity ?? 0, low_stock_alert: branchInv?.low_stock_alert ?? 5 }
    }
    return data
  },

  async getGroupPricing(productId: string) {
    const { data, error } = await db
      .from('product_group_pricing')
      .select('*, customer_groups(name)')
      .eq('product_id', productId)
    if (error) throw error
    return data ?? []
  },

  async setGroupPricing(productId: string, entries: Array<{ customer_group_id: string; price: number }>) {
    // Delete all then re-insert
    await db.from('product_group_pricing').delete().eq('product_id', productId)
    if (entries.length === 0) return []
    const { data, error } = await db
      .from('product_group_pricing')
      .insert(entries.map(e => ({ product_id: productId, ...e })))
      .select()
    if (error) throw error
    return data ?? []
  },

  async create(payload: InsertTables<'products'>) {
    if (!payload.barcode) {
      payload.barcode = Math.floor(100000000000 + Math.random() * 900000000000).toString()
    }
    const { data, error } = await adminSupabase.from('products').insert(payload).select().single()
    if (error) throw error
    return data
  },

  /** Atomically duplicates a product (+ variants) as a draft via the `duplicate_product` SQL function. */
  async duplicateProduct(id: string, businessId: string, branchId: string | undefined, actorId?: string) {
    const { data: newId, error } = await db.rpc('duplicate_product', {
      p_product_id: id,
      p_business_id: businessId,
      p_branch_id: branchId ?? null,
    })
    if (error) throw error

    const duplicate = await ProductService.getById(newId as string, businessId)

    ProductService.recordHistory({
      product_id: newId as string,
      business_id: businessId,
      actor_id: actorId,
      action: 'create',
      category: 'product',
      description: `Duplicated from "${(duplicate as any)?.name?.replace(/ \(Copy - \w{4}\)$/, '') ?? 'product'}"`,
    })

    return duplicate
  },

  async update(id: string, businessId: string, payload: UpdateTables<'products'>) {
    if ('barcode' in payload && !payload.barcode) {
      payload.barcode = Math.floor(100000000000 + Math.random() * 900000000000).toString()
    }
    const { data, error } = await adminSupabase
      .from('products')
      .update(payload)
      .eq('id', id)
      .eq('business_id', businessId)
      .select('*, categories(name), brands(name), suppliers(name, id), service_devices(name, id)')
      .single()
    if (error) throw error
    return data
  },

  async delete(id: string, businessId: string, branchId?: string) {
    // ── Branch-scoped delete ─────────────────────────────────────────────────
    // When a branchId is provided we only remove the product from THAT branch's
    // catalog.  The product row itself is only removed when no branch catalog
    // references it any more (or when there was never a branch_products row).
    if (branchId) {
      // 1. Remove from this branch's catalog
      await adminSupabase
        .from('branch_products')
        .delete()
        .eq('branch_id', branchId)
        .eq('product_id', id)

      // 2. Also drop the inventory row for this branch so stock is clean
      await adminSupabase
        .from('inventory')
        .delete()
        .eq('branch_id', branchId)
        .eq('product_id', id)

      // 3. Check if any other branch still has this product
      const { count } = await adminSupabase
        .from('branch_products')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', id)

      // If other branches still use it, we're done — product row stays.
      if ((count ?? 0) > 0) return
      // Otherwise fall through and delete the product itself.
    }

    // ── Business-wide delete (no branchId, or last branch removed) ───────────
    // Attempt hard delete first; fall back to soft-delete on FK violation.
    const { error: hardDeleteError } = await adminSupabase
      .from('products')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)

    if (hardDeleteError) {
      if (hardDeleteError.code === '23503') {
        // Null out barcode and SKU so their unique constraints don't block
        // future products with the same values.
        const { error: softDeleteError } = await adminSupabase
          .from('products')
          .update({ is_active: false, barcode: null, sku: null })
          .eq('id', id)
          .eq('business_id', businessId)
        if (softDeleteError) throw softDeleteError
      } else {
        throw hardDeleteError
      }
    }
  },

  // ── Branch availability ───────────────────────────────────────────────────

  /** Returns the enabled/disabled status of a product across all business branches. */
  async getBranchAvailability(productId: string, businessId: string) {
    const { data, error } = await adminSupabase
      .from('branches')
      .select('id, name, is_main, branch_products!left(is_enabled)')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('is_main', { ascending: false })
    if (error) throw error
    return (data ?? []).map((b: any) => ({
      branch_id: b.id,
      name: b.name,
      is_main: b.is_main,
      // null means no branch_products row yet → product not in catalog
      is_enabled: b.branch_products?.[0]?.is_enabled ?? false,
    }))
  },

  /** Upserts a branch_products row to enable or disable a product for a branch. */
  async setBranchAvailability(productId: string, branchId: string, isEnabled: boolean) {
    const { error } = await adminSupabase
      .from('branch_products')
      .upsert(
        { branch_id: branchId, product_id: productId, is_enabled: isEnabled },
        { onConflict: 'branch_id,product_id' }
      )
    if (error) throw error

    // When enabling, also ensure an inventory row exists for this branch
    if (isEnabled) {
      await adminSupabase
        .from('inventory')
        .upsert(
          { branch_id: branchId, product_id: productId, quantity: 0, low_stock_alert: 5 },
          { onConflict: 'branch_id,product_id' }
        )
    }
  },

  // ── History ──────────────────────────────────────────────────────────────

  async getHistory(productId: string, businessId: string, category?: string) {
    let q = db
      .from('product_history')
      .select('*')
      .eq('product_id', productId)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (category) q = q.eq('category', category)
    const { data, error } = await q
    if (error) throw error
    return data ?? []
  },

  async recordHistory(entry: {
    product_id: string; business_id: string; actor_id?: string; actor_name?: string
    action: 'create' | 'update' | 'delete'; category: string; description: string; metadata?: Record<string, unknown>
  }) {
    try {
      await db.from('product_history').insert(entry) // non-blocking — errors are swallowed below
    } catch {
      // non-fatal — history is best-effort
    }
  },

  // ── Stats ────────────────────────────────────────────────────────────────

  async getStats(businessId: string, branchId?: string) {
    let stockRetailValue = 0
    let stockCostValue   = 0
    let lowStockCount    = 0

    // In Purchase Order is branch-scoped like every other card here — purchase_orders
    // carries its own branch_id, so a multi-branch business doesn't see other
    // branches' incoming stock counted against this one.
    let poQuery = adminSupabase
      .from('purchase_order_items')
      .select('*, purchase_orders!inner(business_id, branch_id, status)', { count: 'exact', head: true })
      .gt('quantity_ordered', 0)
      .eq('purchase_orders.business_id', businessId)
      .in('purchase_orders.status', ['pending', 'ordered', 'partial'])
    if (branchId) poQuery = poQuery.eq('purchase_orders.branch_id', branchId)

    // Run all queries in parallel
    const [invResult, variantInvResult, poResult, batchValuation] = await Promise.all([
      // Base product rows (variant_id IS NULL) — includes has_variants so we can skip those below
      branchId
        ? adminSupabase
            .from('inventory')
            .select('quantity, low_stock_alert, product_id, products!inner(selling_price, cost_price, is_service, is_active, has_variants)')
            .eq('branch_id', branchId)
            .is('variant_id', null)
        : Promise.resolve({ data: null }),
      // Variant rows — prefer variant's own price, fall back to parent product price
      branchId
        ? adminSupabase
            .from('inventory')
            .select('quantity, low_stock_alert, product_id, product_variants!inner(selling_price, cost_price, products!inner(is_service, is_active, selling_price, cost_price))')
            .eq('branch_id', branchId)
            .not('variant_id', 'is', null)
        : Promise.resolve({ data: null }),
      poQuery,
      branchId ? ProductService.getBatchValuationByBranch(branchId) : Promise.resolve(new Map()),
    ])

    // Products with variants collapse to a single "needs reordering" row in the
    // low-stock list view (has_low_stock_variant), so the count here tracks
    // distinct products, not one increment per low-stock variant, to match
    // what you actually see after clicking the card.
    const lowStockProductIds = new Set<string>()

    if (branchId && invResult.data) {
      // Base product rows — skip products that have variants; those are counted
      // separately below using each variant's own price to avoid double-counting
      // and to get the correct per-variant selling/cost price.
      ;(invResult.data as any[]).forEach((row: any) => {
        const p = row.products
        if (p?.has_variants) return
        // Inactive/service rows are excluded from stock value AND from the
        // low-stock list/filter (list()'s lowStockOnly excludes is_service,
        // and inactive products aren't shown by default) — exclude them here
        // too so this count matches what clicking the card actually shows.
        if (!p?.is_active || p?.is_service) return
        stockRetailValue += (p.selling_price ?? 0) * row.quantity
        const batch = (batchValuation as Map<string, { totalValue: number }>).get(`${row.product_id}::null`)
        stockCostValue += batch ? batch.totalValue : (p.cost_price ?? 0) * row.quantity
        const threshold = row.low_stock_alert ?? 5
        if (row.quantity <= threshold) lowStockProductIds.add(row.product_id)
      })
    }

    if (branchId && variantInvResult.data) {
      ;(variantInvResult.data as any[]).forEach((row: any) => {
        const v = row.product_variants
        const p = v?.products
        if (!p?.is_active || p?.is_service) return
        const sellPrice = v.selling_price ?? p.selling_price ?? 0
        const costPrice = v.cost_price   ?? p.cost_price   ?? 0
        stockRetailValue += sellPrice * row.quantity
        stockCostValue   += costPrice  * row.quantity
        const threshold = row.low_stock_alert ?? 5
        if (row.quantity <= threshold) lowStockProductIds.add(row.product_id)
      })
    }
    lowStockCount = lowStockProductIds.size
    // When no branchId, return zeros — summing raw prices without quantities
    // would produce a meaningless number that looks like real stock value.

    const customerBoughtRes = await (adminSupabase as any)
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('is_trade_in', true)
      .eq('is_active', true)

    return {
      stockRetailValue,
      stockCostValue,
      lowStockCount,
      inPoCount: poResult.count ?? 0,
      customerBoughtCount: customerBoughtRes.count ?? 0,
    }
  },

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(productId: string, businessId: string, branchId?: string) {
    const { data: product, error: prodErr } = await adminSupabase
      .from('products').select('id').eq('id', productId).eq('business_id', businessId).single()
    if (prodErr || !product) throw new Error('Product not found')

    const { data, error } = await adminSupabase
      .from('product_variants').select('*, inventory!left(quantity, branch_id)').eq('product_id', productId).order('name', { ascending: true })
    if (error) throw error

    // Active discount allocations, keyed by variant_id — same bulk-fetch
    // pattern as ProductService.list()'s product-level discountMap, just
    // scoped to this one product's variants instead of a whole branch page.
    const discountByVariant = new Map<string, { discount_price: number; quantity_remaining: number }>()
    if (branchId) {
      const { data: discounts } = await db
        .from('product_discount_allocations')
        .select('variant_id, discount_price, quantity_remaining')
        .eq('product_id', productId)
        .eq('branch_id', branchId)
        .eq('status', 'active')
        .not('variant_id', 'is', null)
      for (const d of (discounts ?? []) as any[]) {
        discountByVariant.set(d.variant_id, { discount_price: d.discount_price, quantity_remaining: d.quantity_remaining })
      }
    }

    return (data ?? []).map((v: any) => {
      const inv = branchId ? v.inventory?.find((i: any) => i.branch_id === branchId) : null
      const stock = branchId ? (inv ? inv.quantity : null) : null
      return { ...v, stock, inventory: undefined, active_discount: discountByVariant.get(v.id) ?? null }
    })
  },

  async createVariants(productId: string, businessId: string, variants: Array<{
    name: string; sku?: string | null; barcode?: string | null
    selling_price: number; cost_price?: number | null; attributes?: Record<string, string>
    stock?: number; image_url?: string | null
  }>, branchId?: string) {
    const { data: product, error: prodErr } = await adminSupabase
      .from('products').select('id').eq('id', productId).eq('business_id', businessId).single()
    if (prodErr || !product) throw new Error('Product not found')

    const rows = variants.map(v => ({
      product_id: productId, name: v.name, sku: v.sku ?? null, barcode: v.barcode || Math.floor(100000000000 + Math.random() * 900000000000).toString(),
      selling_price: v.selling_price, cost_price: v.cost_price ?? null, attributes: v.attributes ?? {},
      image_url: v.image_url ?? null,
    }))

    const { data, error } = await adminSupabase.from('product_variants').insert(rows).select()
    if (error) throw error

    await adminSupabase.from('products').update({ has_variants: true }).eq('id', productId)

    // Handle stock — batch all inventory writes into 3 queries total (was 3×N)
    if (branchId && data) {
      const insertedIds = data.map(d => d.id)

      // 1 query: find which inventory rows already exist for these variants
      const { data: existingRows } = await adminSupabase
        .from('inventory')
        .select('id, variant_id')
        .eq('branch_id', branchId)
        .eq('product_id', productId)
        .in('variant_id', insertedIds)

      const existingMap = new Map((existingRows ?? []).map(r => [r.variant_id as string, r.id as string]))

      const toUpdate = data.filter(d => existingMap.has(d.id))
      const toInsert = data.filter(d => !existingMap.has(d.id))

      // 1 query: bulk update existing rows in parallel
      if (toUpdate.length > 0) {
        await Promise.all(toUpdate.map(d =>
          adminSupabase.from('inventory')
            .update({ quantity: variants[data.indexOf(d)].stock ?? 0 })
            .eq('id', existingMap.get(d.id)!)
        ))
      }

      // 1 query: bulk insert new rows
      if (toInsert.length > 0) {
        await adminSupabase.from('inventory').insert(
          toInsert.map(d => ({
            branch_id:      branchId,
            product_id:     productId,
            variant_id:     d.id,
            quantity:       variants[data.indexOf(d)].stock ?? 0,
            low_stock_alert: 5,
          }))
        )

        // Seed the first FIFO batch for variants with opening stock, same as
        // ProductController.create does for simple products — otherwise the
        // variant never has a cost layer to sell against.
        const layers = toInsert
          .map(d => ({ d, v: variants[data.indexOf(d)] }))
          .filter(({ v }) => (v.stock ?? 0) > 0)
          .map(({ d, v }) => ({
            branch_id: branchId, product_id: productId, variant_id: d.id,
            quantity: v.stock, unit_cost: v.cost_price ?? 0, selling_price: v.selling_price ?? null,
            source_type: 'adjustment',
          }))
        if (layers.length > 0) {
          await adminSupabase.from('inventory_cost_layers').insert(layers)
        }
      }
    }

    return data ?? []
  },

  async updateVariant(variantId: string, productId: string, businessId: string, payload: {
    name?: string; sku?: string | null; barcode?: string | null
    selling_price?: number; cost_price?: number | null; attributes?: Record<string, string>
    stock?: number; image_url?: string | null
  }, branchId?: string) {
    const { stock, ...variantPayload } = payload
    const { data: product, error: prodErr } = await adminSupabase
      .from('products').select('id').eq('id', productId).eq('business_id', businessId).single()
    if (prodErr || !product) throw new Error('Product not found')

    if ('barcode' in variantPayload && !variantPayload.barcode) {
      variantPayload.barcode = Math.floor(100000000000 + Math.random() * 900000000000).toString()
    }

    const { data, error } = await adminSupabase
      .from('product_variants').update(variantPayload).eq('id', variantId).eq('product_id', productId).select().single()
    if (error) throw error

    // Handle stock
    if (stock !== undefined && branchId) {
      const { data: existingInv } = await adminSupabase.from('inventory')
        .select('id, quantity').eq('branch_id', branchId).eq('product_id', productId).eq('variant_id', variantId).maybeSingle()
      const unitCost = variantPayload.cost_price ?? (data as any)?.cost_price ?? 0
      const sellingPrice = variantPayload.selling_price ?? (data as any)?.selling_price ?? null
      if (existingInv) {
        await adminSupabase.from('inventory').update({ quantity: stock }).eq('id', existingInv.id)
        // Only a net increase gets a new batch — an absolute-quantity edit
        // downward is a correction, not a new purchase.
        const delta = stock - (existingInv.quantity ?? 0)
        if (delta > 0) {
          await adminSupabase.from('inventory_cost_layers').insert({
            branch_id: branchId, product_id: productId, variant_id: variantId,
            quantity: delta, unit_cost: unitCost, selling_price: sellingPrice, source_type: 'adjustment',
          })
        }
      } else {
        await adminSupabase.from('inventory').insert({ branch_id: branchId, product_id: productId, variant_id: variantId, quantity: stock, low_stock_alert: 5 })
        if (stock > 0) {
          await adminSupabase.from('inventory_cost_layers').insert({
            branch_id: branchId, product_id: productId, variant_id: variantId,
            quantity: stock, unit_cost: unitCost, selling_price: sellingPrice, source_type: 'adjustment',
          })
        }
      }
    }

    return data
  },

  async deleteVariant(variantId: string, productId: string, businessId: string) {
    const { data: product, error: prodErr } = await adminSupabase
      .from('products').select('id').eq('id', productId).eq('business_id', businessId).single()
    if (prodErr || !product) throw new Error('Product not found')

    const { error } = await adminSupabase.from('product_variants').delete().eq('id', variantId).eq('product_id', productId)
    if (error) throw error

    const { count } = await adminSupabase.from('product_variants').select('*', { count: 'exact', head: true }).eq('product_id', productId)
    if ((count ?? 0) === 0) {
      await adminSupabase.from('products').update({ has_variants: false }).eq('id', productId)
    }
  },

  async findByVariantBarcode(businessId: string, barcode: string) {
    const { data, error } = await db
      .from('product_variants')
      .select('*, products!inner(*, categories(name), brands(name))')
      .eq('products.business_id', businessId)
      .or(`barcode.eq."${barcode}",sku.eq."${barcode}"`)
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const { products: product, ...variant } = data
    return { product, variant }
  },

  async checkAvailability(businessId: string, params: { sku?: string | null; barcode?: string | null; excludeId?: string | null }) {
    const { sku, barcode, excludeId } = params
    const result = { skuExists: false, barcodeExists: false }

    if (sku) {
      let q = adminSupabase.from('products').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('sku', sku).eq('is_active', true)
      if (excludeId) q = q.neq('id', excludeId)
      const { count } = await q
      result.skuExists = (count ?? 0) > 0
    }

    if (barcode) {
      let q = adminSupabase.from('products').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('barcode', barcode).eq('is_active', true)
      if (excludeId) q = q.neq('id', excludeId)
      const { count } = await q
      result.barcodeExists = (count ?? 0) > 0
    }

    return result
  },

  // Quick buyback from POS Cash Out: adds one unit to stock, tags the
  // product as trade-in stock, and sets its cost to what was actually paid
  // for it — deliberately simple (no separate ledger/condition-grade flow).
  // Either an existing product_id is passed, or name/selling_price to
  // quick-create a new product for the item just bought from the customer.
  async recordBuyback(
    branchId: string,
    businessId: string,
    amount: number,
    opts: { product_id?: string; name?: string; selling_price?: number; barcode?: string }
  ) {
    let productId = opts.product_id

    if (!productId) {
      const newProduct = await ProductService.create({
        business_id: businessId,
        name: opts.name,
        selling_price: opts.selling_price,
        cost_price: amount,
        barcode: opts.barcode || null,
        item_type: 'product',
        is_trade_in: true,
      } as InsertTables<'products'>)
      productId = newProduct.id

      await adminSupabase
        .from('branch_products')
        .upsert({ branch_id: branchId, product_id: productId, is_enabled: true }, { onConflict: 'branch_id,product_id' })
    }

    const { data: existingInv } = await adminSupabase
      .from('inventory')
      .select('id, quantity')
      .eq('branch_id', branchId)
      .eq('product_id', productId)
      .maybeSingle()

    if (existingInv) {
      await adminSupabase
        .from('inventory')
        .update({ quantity: (existingInv as any).quantity + 1, updated_at: new Date().toISOString() })
        .eq('id', (existingInv as any).id)
    } else {
      await adminSupabase
        .from('inventory')
        .insert({ branch_id: branchId, product_id: productId, quantity: 1, low_stock_alert: 5 })
    }

    await adminSupabase.from('stock_movements').insert({
      branch_id: branchId, product_id: productId,
      type: 'trade_in', quantity: 1,
      note: 'Buyback from customer',
    })

    if (opts.product_id) {
      const { data: product, error } = await adminSupabase
        .from('products')
        .update({ cost_price: amount, is_trade_in: true })
        .eq('id', productId)
        .select()
        .single()
      if (error) throw error
      return product
    }

    return ProductService.getById(productId, businessId)
  },
}
