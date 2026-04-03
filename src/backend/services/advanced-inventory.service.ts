import { adminSupabase } from '@/backend/config/supabase'

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
