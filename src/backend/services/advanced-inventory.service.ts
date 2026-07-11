import { adminSupabase } from '@/backend/config/supabase'

// ── Product Bundles ─────────────────────────────────────────

export const BundleService = {
  async list(businessId: string) {
    const { data, error } = await adminSupabase
      .from('product_bundles')
      .select('*, product_bundle_items(id, product_id, quantity, products(id, name, sku, selling_price))')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async create(payload: {
    business_id: string; name: string; bundle_price: number
    description?: string; sku?: string; is_active?: boolean
    items: { product_id: string; quantity: number }[]
  }) {
    const { items, ...bundle } = payload
    const { data: b, error: bErr } = await adminSupabase
      .from('product_bundles')
      .insert({ ...bundle, is_active: bundle.is_active ?? true })
      .select()
      .single()
    if (bErr) throw bErr
    if (items.length > 0) {
      const { error: iErr } = await adminSupabase
        .from('product_bundle_items')
        .insert(items.map((i) => ({ bundle_id: b.id, ...i })))
      if (iErr) throw iErr
    }
    return b
  },

  async update(id: string, payload: {
    name?: string; bundle_price?: number; description?: string
    sku?: string; is_active?: boolean
    items?: { product_id: string; quantity: number }[]
  }) {
    const { items, ...bundle } = payload
    const { data: b, error: bErr } = await adminSupabase
      .from('product_bundles')
      .update(bundle)
      .eq('id', id)
      .select()
      .single()
    if (bErr) throw bErr
    if (items !== undefined) {
      await adminSupabase.from('product_bundle_items').delete().eq('bundle_id', id)
      if (items.length > 0) {
        const { error: iErr } = await adminSupabase
          .from('product_bundle_items')
          .insert(items.map((i) => ({ bundle_id: id, ...i })))
        if (iErr) throw iErr
      }
    }
    return b
  },

  async remove(id: string) {
    await adminSupabase.from('product_bundle_items').delete().eq('bundle_id', id)
    const { error } = await adminSupabase.from('product_bundles').delete().eq('id', id)
    if (error) throw error
  },
}

// ── Trade-Ins ───────────────────────────────────────────────

export const TradeInService = {
  async list(branchId: string, page = 1, limit = 20) {
    const from = (page - 1) * limit
    const to   = from + limit - 1
    const { data, count, error } = await adminSupabase
      .from('trade_in_transactions')
      .select('*, products(name), customers(id, first_name, last_name, phone)', { count: 'exact' })
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw error
    return { data: data ?? [], total: count ?? 0 }
  },

  async create(payload: {
    business_id: string; branch_id: string; product_id: string
    condition_grade: string; trade_in_value: number
    serial_number?: string; imei?: string; notes?: string; customer_id?: string
  }) {
    const { data, error } = await adminSupabase
      .from('trade_in_transactions')
      .insert(payload)
      .select()
      .single()
    if (error) throw error

    // Add the traded-in unit back into stock — same pattern GrnService.create()
    // uses for received POs (upsert inventory, log stock_movements, add a
    // cost layer, update average cost).
    const { branch_id, product_id, trade_in_value } = payload

    const { data: existingInv } = await adminSupabase
      .from('inventory')
      .select('id, quantity')
      .eq('branch_id', branch_id)
      .eq('product_id', product_id)
      .maybeSingle()

    if (existingInv) {
      await adminSupabase
        .from('inventory')
        .update({ quantity: (existingInv as any).quantity + 1, updated_at: new Date().toISOString() })
        .eq('id', (existingInv as any).id)
    } else {
      await adminSupabase
        .from('inventory')
        .insert({ branch_id, product_id, quantity: 1, low_stock_alert: 5 })
    }

    await adminSupabase.from('stock_movements').insert({
      branch_id, product_id,
      type: 'trade_in',
      quantity: 1,
      reference_id: data.id,
      note: 'Trade-in / buyback',
    })

    await adminSupabase.from('inventory_cost_layers').insert({
      product_id, branch_id,
      quantity: 1,
      unit_cost: trade_in_value,
      source_id: data.id,
      source_type: 'trade_in',
    })
    await (adminSupabase as any).rpc('update_average_cost', {
      p_product_id: product_id,
      p_new_qty: 1,
      p_new_cost: trade_in_value,
    })

    return data
  },
}

// ── Serialized Inventory ────────────────────────────────────

export const SerialService = {
  async list(productId: string, branchId: string) {
    const { data, error } = await adminSupabase
      .from('inventory_serials')
      .select('*')
      .eq('product_id', productId)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async create(payload: {
    product_id: string; branch_id: string; serial_number: string
    imei?: string; notes?: string; purchase_order_id?: string
  }) {
    const { data, error } = await adminSupabase
      .from('inventory_serials')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateStatus(id: string, status: string, refId?: { sale_id?: string; repair_id?: string }) {
    const { data, error } = await adminSupabase
      .from('inventory_serials')
      .update({ status, ...refId })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async bulkCreate(serials: { product_id: string; branch_id: string; serial_number: string; imei?: string }[]) {
    const { data, error } = await adminSupabase
      .from('inventory_serials')
      .insert(serials)
      .select()
    if (error) throw error
    return data ?? []
  },

  async remove(id: string) {
    const { error } = await adminSupabase.from('inventory_serials').delete().eq('id', id)
    if (error) throw error
  },
}

// ── Inventory Count Tool ────────────────────────────────────

export const CountService = {
  async list(branchId: string) {
    const { data, error } = await adminSupabase
      .from('inventory_counts')
      .select('*, profiles(full_name)')
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async getById(id: string) {
    const { data, error } = await adminSupabase
      .from('inventory_counts')
      .select(`
        *,
        profiles(full_name),
        inventory_count_items(
          *,
          products(id, name, sku)
        )
      `)
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async create(payload: {
    business_id: string; branch_id: string; name: string; started_by: string; notes?: string
  }) {
    // Snapshot current inventory quantities into count items
    const { data: inv } = await adminSupabase
      .from('inventory')
      .select('product_id, quantity, products(name, sku)')
      .eq('branch_id', payload.branch_id)

    const { data: count, error } = await adminSupabase
      .from('inventory_counts')
      .insert({ ...payload, status: 'in_progress' })
      .select()
      .single()
    if (error) throw error

    if (inv && inv.length > 0) {
      const items = inv.map((row) => ({
        count_id: count.id,
        product_id: row.product_id,
        system_qty: row.quantity,
        counted_qty: null,
      }))
      await adminSupabase.from('inventory_count_items').insert(items)
    }

    return count
  },

  async updateCounts(countId: string, updates: { item_id: string; counted_qty: number; notes?: string }[]) {
    const results = await Promise.all(
      updates.map(({ item_id, counted_qty, notes }) =>
        adminSupabase
          .from('inventory_count_items')
          .update({ counted_qty, notes })
          .eq('id', item_id)
          .eq('count_id', countId)
      )
    )
    const err = results.find((r) => r.error)
    if (err?.error) throw err.error
  },

  async complete(countId: string, adjustedBy: string) {
    const { error } = await adminSupabase.rpc('complete_inventory_count', {
      p_count_id: countId,
      p_adjusted_by: adjustedBy,
    })
    if (error) throw error
  },

  async cancel(countId: string) {
    const { error } = await adminSupabase
      .from('inventory_counts')
      .update({ status: 'cancelled' })
      .eq('id', countId)
    if (error) throw error
  },
}
