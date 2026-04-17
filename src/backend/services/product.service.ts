import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables, UpdateTables } from '@/types/database'

// product_history and product_group_pricing are from migration 033 — use `as any`
const db = adminSupabase as any

export const ProductService = {
  async list(businessId: string, params: {
    page?: number; limit?: number; search?: string; categoryId?: string
    branchId?: string; includeInactive?: boolean
    brandId?: string; supplierId?: string; valuation?: string
    hideOutOfStock?: boolean; itemType?: string; modelId?: string; partType?: string
  }) {
    const { page = 1, limit = 20, search, categoryId, branchId, includeInactive,
            brandId, supplierId, valuation, hideOutOfStock, itemType, modelId, partType } = params

    const inventorySelect = branchId
      ? `*, categories(name), brands(name), inventory!left(quantity, low_stock_alert, branch_id, variant_id), product_variants(id), suppliers(name), service_devices(name), branch_products!inner(is_enabled)`
      : `*, categories(name), brands(name), product_variants(id), suppliers(name), service_devices(name)`

    let q = db
      .from('products')
      .select(inventorySelect, { count: 'exact' })
      .eq('business_id', businessId)
      .order('name')
      .range((page - 1) * limit, page * limit - 1)

    if (!includeInactive) q = q.eq('is_active', true)

    // When listing for a specific branch, only return products that are enabled
    // in that branch's catalog via the branch_products join.
    if (branchId) {
      q = q
        .eq('branch_products.branch_id', branchId)
        .eq('branch_products.is_enabled', true)
    }
    if (search) q = q.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%,imei.ilike.%${search}%`)
    if (categoryId) q = q.eq('category_id', categoryId)
    if (brandId) q = q.eq('brand_id', brandId)
    if (supplierId) q = q.eq('supplier_id', supplierId)
    if (valuation) q = q.eq('valuation_method', valuation)
    if (itemType) q = q.eq('item_type', itemType)
    if (modelId) q = q.eq('model_id', modelId)
    if (partType) q = q.eq('part_type', partType)

    const { data, error, count } = await q
    if (error) throw error

    let enriched = (data ?? []).map((p: Record<string, unknown>) => {
      const variantCount = Array.isArray(p.product_variants) ? (p.product_variants as unknown[]).length : 0
      if (!branchId || !Array.isArray(p.inventory)) {
        return { ...p, variant_count: variantCount, product_variants: undefined }
      }
      const branchInv = (p.inventory as Array<{ branch_id: string; quantity: number; low_stock_alert: number | null; variant_id: string | null }>)
        .find((i) => i.branch_id === branchId && i.variant_id === null)
      const on_hand = branchInv?.quantity ?? 0
      return { ...p, on_hand, low_stock_alert: branchInv?.low_stock_alert ?? null, inventory: undefined, branch_products: undefined, variant_count: variantCount, product_variants: undefined }
    })

    if (hideOutOfStock) {
      enriched = enriched.filter((p: any) => p.is_service || (p.on_hand ?? 0) > 0)
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
    const { data, error } = await adminSupabase.from('products').insert(payload).select().single()
    if (error) throw error
    return data
  },

  async update(id: string, businessId: string, payload: UpdateTables<'products'>) {
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
        const { error: softDeleteError } = await adminSupabase
          .from('products')
          .update({ is_active: false })
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
    await db.from('product_history').insert(entry).catch(() => {}) // non-blocking
  },

  // ── Stats ────────────────────────────────────────────────────────────────

  async getStats(businessId: string, branchId?: string) {
    // Total retail value and cost value
    const { data: products } = await adminSupabase
      .from('products')
      .select('selling_price, cost_price')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .eq('is_service', false)

    let stockRetailValue = 0
    let stockCostValue   = 0
    let lowStockCount    = 0

    if (branchId) {
      // Only count base-product rows (variant_id IS NULL) to avoid double-counting
      // stock when a product has variant-level inventory rows alongside a base row.
      const { data: inv } = await adminSupabase
        .from('inventory')
        .select('quantity, low_stock_alert, product_id, products!inner(selling_price, cost_price, is_service, is_active)')
        .eq('branch_id', branchId)
        .is('variant_id', null)

      ;(inv ?? []).forEach((row: any) => {
        const p = row.products
        if (!p?.is_active || p?.is_service) return
        stockRetailValue += (p.selling_price ?? 0) * row.quantity
        stockCostValue   += (p.cost_price   ?? 0) * row.quantity
        if (row.low_stock_alert != null && row.quantity > 0 && row.quantity <= row.low_stock_alert) lowStockCount++
      })
    }
    // When no branchId, return zeros — summing raw prices without quantities
    // would produce a meaningless number that looks like real stock value.

    // In Purchase Order count
    const { count: inPoCount } = await adminSupabase
      .from('purchase_order_items')
      .select('*', { count: 'exact', head: true })
      .gt('quantity_ordered', 0)
      .filter('purchase_orders.business_id', 'eq', businessId)

    return { stockRetailValue, stockCostValue, lowStockCount, inPoCount: inPoCount ?? 0 }
  },

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(productId: string, businessId: string) {
    const { data: product, error: prodErr } = await adminSupabase
      .from('products').select('id').eq('id', productId).eq('business_id', businessId).single()
    if (prodErr || !product) throw new Error('Product not found')

    const { data, error } = await adminSupabase
      .from('product_variants').select('*').eq('product_id', productId).order('name', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async createVariants(productId: string, businessId: string, variants: Array<{
    name: string; sku?: string | null; barcode?: string | null
    selling_price: number; cost_price?: number | null; attributes?: Record<string, string>
  }>) {
    const { data: product, error: prodErr } = await adminSupabase
      .from('products').select('id').eq('id', productId).eq('business_id', businessId).single()
    if (prodErr || !product) throw new Error('Product not found')

    const rows = variants.map(v => ({
      product_id: productId, name: v.name, sku: v.sku ?? null, barcode: v.barcode ?? null,
      selling_price: v.selling_price, cost_price: v.cost_price ?? null, attributes: v.attributes ?? {},
    }))

    const { data, error } = await adminSupabase.from('product_variants').insert(rows).select()
    if (error) throw error

    await adminSupabase.from('products').update({ has_variants: true }).eq('id', productId)
    return data ?? []
  },

  async updateVariant(variantId: string, productId: string, businessId: string, payload: {
    name?: string; sku?: string | null; barcode?: string | null
    selling_price?: number; cost_price?: number | null; attributes?: Record<string, string>
  }) {
    const { data: product, error: prodErr } = await adminSupabase
      .from('products').select('id').eq('id', productId).eq('business_id', businessId).single()
    if (prodErr || !product) throw new Error('Product not found')

    const { data, error } = await adminSupabase
      .from('product_variants').update(payload).eq('id', variantId).eq('product_id', productId).select().single()
    if (error) throw error
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
}
