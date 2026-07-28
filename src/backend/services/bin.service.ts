import { adminSupabase } from '@/backend/config/supabase'

const db = (table: string): any => (adminSupabase as any).from(table)
const rpc = (fn: string, args?: Record<string, unknown>) => (adminSupabase as any).rpc(fn, args)

export const BinService = {
  async list(branchId: string, status: 'binned' | 'restored') {
    const { data, error } = await db('bin_items')
      .select('*, products(name, image_url), product_variants(name)')
      .eq('branch_id', branchId)
      .eq('status', status)
      .order('binned_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  // Wraps the read-check-decrement-log-record sequence in a single Postgres
  // transaction (move_item_to_bin, migration 045) instead of four separate
  // REST calls — a crash between steps used to leave stock quietly gone with
  // no Bin record, and two concurrent moves of the same product could both
  // read the same starting quantity before either wrote it back. The RPC's
  // inventory decrement is a single `UPDATE ... WHERE quantity >= X`, which
  // Postgres serializes against every other writer of that row, not just
  // other Bin calls.
  async moveToBin(
    businessId: string,
    branchId: string,
    productId: string,
    variantId: string | null,
    quantity: number,
    reason: string | null,
    userId: string
  ) {
    const { data, error } = await rpc('move_item_to_bin', {
      p_business_id: businessId,
      p_branch_id:   branchId,
      p_product_id:  productId,
      p_variant_id:  variantId,
      p_quantity:    quantity,
      p_reason:      reason,
      p_user_id:     userId,
    })
    if (error) throw new Error(error.message ?? 'Failed to move item to Bin')
    return data
  },

  async restore(id: string, branchId: string, userId: string) {
    const { data, error } = await rpc('restore_bin_item', {
      p_id: id,
      p_branch_id: branchId,
      p_user_id: userId,
    })
    if (error) throw new Error(error.message ?? 'Failed to restore item')
    return data
  },
}
