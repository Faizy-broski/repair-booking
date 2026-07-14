import { adminSupabase } from '@/backend/config/supabase'

const db = (t: string): any => (adminSupabase as any).from(t)

export const InventoryService = {
  async getStock(branchId: string, params: { page?: number; limit?: number; lowStock?: boolean }) {
    const { page = 1, limit = 20, lowStock } = params
    let q = adminSupabase
      .from('inventory')
      .select('*, products(name,sku,selling_price,image_url), product_variants(name)', { count: 'exact' })
      .eq('branch_id', branchId)
      .order('updated_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (lowStock) q = q.lte('quantity', adminSupabase.rpc as unknown as number)

    const { data, error, count } = await q
    if (error) throw error
    return { data, count }
  },

  async adjustStock(
    branchId: string,
    productId: string,
    variantId: string | null,
    quantity: number,
    userId: string,
    note?: string
  ) {
    // Single atomic RPC: locks the inventory row, applies the quantity
    // delta, and creates/consumes a cost layer accordingly (positive delta
    // seeds a layer at the current best-known cost; negative delta consumes
    // via the same FIFO/LIFO path a real sale uses) — see
    // apply_inventory_adjustment in migration 136_true_fifo_costing.sql.
    const { error } = await (adminSupabase.rpc as any)('apply_inventory_adjustment', {
      p_branch_id: branchId,
      p_product_id: productId,
      p_variant_id: variantId,
      p_delta: quantity,
      p_note: note ?? null,
      p_user_id: userId,
    })
    if (error) throw error
  },

  async getLowStockAlerts(branchId: string) {
    // Order by quantity ASC so the most critically low items come first.
    // Limit caps the result set — low-stock items have the smallest quantities
    // so the 100 rows with the lowest counts cover all genuinely alert-worthy items.
    const { data, error } = await adminSupabase
      .from('inventory')
      .select('*, products(id,name,sku,image_url,cost_price)')
      .eq('branch_id', branchId)
      .order('quantity', { ascending: true })
      .limit(100)

    if (error) throw error
    return ((data ?? []) as any[]).filter((inv: any) => inv.quantity <= (inv.low_stock_alert ?? 5))
  },

  async setLevel(
    branchId: string,
    productId: string,
    variantId: string | null,
    quantity: number,
    lowStockAlert: number
  ) {
    const { error } = await db('inventory')
      .upsert(
        {
          branch_id: branchId,
          product_id: productId,
          variant_id: variantId,
          quantity,
          low_stock_alert: lowStockAlert,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'product_id,branch_id' }
      )
    if (error) throw error
  },
}
