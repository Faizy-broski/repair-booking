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
    // Upsert inventory
    const { data: inv } = await adminSupabase
      .from('inventory')
      .select('id, quantity')
      .eq('branch_id', branchId)
      .eq('product_id', productId)
      .maybeSingle()

    if (inv) {
      await db('inventory')
        .update({ quantity: (inv as any).quantity + quantity })
        .eq('id', (inv as any).id)
    } else {
      await db('inventory').insert({
        branch_id: branchId,
        product_id: productId,
        variant_id: variantId,
        quantity: Math.max(0, quantity),
      })
    }

    // Log movement
    await db('stock_movements').insert({
      branch_id: branchId,
      product_id: productId,
      variant_id: variantId,
      type: 'adjustment',
      quantity,
      note,
      created_by: userId,
    })
  },

  async getLowStockAlerts(branchId: string) {
    const { data, error } = await adminSupabase
      .from('inventory')
      .select('*, products(id,name,sku,image_url,cost_price)')
      .eq('branch_id', branchId)

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
