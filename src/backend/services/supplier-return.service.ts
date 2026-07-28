import { adminSupabase } from '@/backend/config/supabase'
import { PurchaseOrderService } from '@/backend/services/supply-chain.service'

const db = (table: string): any => (adminSupabase as any).from(table)
const rpc = (fn: string, args?: Record<string, unknown>) => (adminSupabase as any).rpc(fn, args)

export interface SupplierReturnItemInput {
  product_id: string
  variant_id?: string | null
  po_item_id?: string | null
  name: string
  sku?: string | null
  quantity: number
  unit_cost: number
  reason?: string | null
}

export const SupplierReturnService = {
  async list(businessId: string, branchId: string, params: { status?: string; supplierId?: string; poId?: string; page?: number; limit?: number }) {
    const { page = 1, limit = 20, status, supplierId, poId } = params
    let q = db('supplier_returns')
      .select('*, suppliers(name), purchase_orders(po_number)', { count: 'exact' })
      .eq('business_id', businessId)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (status) q = q.eq('status', status)
    if (supplierId) q = q.eq('supplier_id', supplierId)
    if (poId) q = q.eq('po_id', poId)

    const { data, error, count } = await q
    if (error) throw error
    return { data: data ?? [], count: count ?? 0 }
  },

  async getById(id: string, businessId: string) {
    const { data, error } = await db('supplier_returns')
      .select('*, suppliers(*), purchase_orders(po_number, status), supplier_return_items(*, products(name, sku), product_variants(name))')
      .eq('id', id)
      .eq('business_id', businessId)
      .single()
    if (error) throw error
    return data
  },

  async create(businessId: string, branchId: string, payload: {
    supplier_id: string
    po_id?: string | null
    notes?: string | null
    items: SupplierReturnItemInput[]
    created_by?: string
  }) {
    if (!payload.items.length) throw new Error('A supplier return needs at least one item')

    const { data: returnNumber, error: numErr } = await rpc('generate_supplier_return_number', { p_branch_id: branchId })
    if (numErr) throw numErr

    const totalValue = payload.items.reduce((sum, i) => sum + i.quantity * i.unit_cost, 0)

    const { data: ret, error: retErr } = await db('supplier_returns')
      .insert({
        business_id:   businessId,
        branch_id:     branchId,
        supplier_id:   payload.supplier_id,
        po_id:         payload.po_id ?? null,
        return_number: returnNumber,
        notes:         payload.notes ?? null,
        total_value:   totalValue,
        created_by:    payload.created_by ?? null,
      })
      .select()
      .single()
    if (retErr) throw retErr

    const { error: itemsErr } = await db('supplier_return_items').insert(
      payload.items.map((i) => ({
        return_id:  ret.id,
        product_id: i.product_id,
        variant_id: i.variant_id ?? null,
        po_item_id: i.po_item_id ?? null,
        name:       i.name,
        sku:        i.sku ?? null,
        quantity:   i.quantity,
        unit_cost:  i.unit_cost,
        reason:     i.reason ?? null,
      }))
    )
    if (itemsErr) throw itemsErr

    return ret
  },

  // Draft-only: line items can be freely replaced since nothing has touched
  // inventory yet.
  async updateItems(id: string, businessId: string, payload: { notes?: string | null; items: SupplierReturnItemInput[] }) {
    if (!payload.items.length) throw new Error('A supplier return needs at least one item')

    const { data: ret, error: retErr } = await db('supplier_returns')
      .select('id, status')
      .eq('id', id)
      .eq('business_id', businessId)
      .single()
    if (retErr) throw retErr
    if (ret.status !== 'draft') throw new Error('Only a draft return can be edited')

    const totalValue = payload.items.reduce((sum, i) => sum + i.quantity * i.unit_cost, 0)

    const { error: delErr } = await db('supplier_return_items').delete().eq('return_id', id)
    if (delErr) throw delErr

    const { error: itemsErr } = await db('supplier_return_items').insert(
      payload.items.map((i) => ({
        return_id:  id,
        product_id: i.product_id,
        variant_id: i.variant_id ?? null,
        po_item_id: i.po_item_id ?? null,
        name:       i.name,
        sku:        i.sku ?? null,
        quantity:   i.quantity,
        unit_cost:  i.unit_cost,
        reason:     i.reason ?? null,
      }))
    )
    if (itemsErr) throw itemsErr

    const { data: updated, error: updErr } = await db('supplier_returns')
      .update({ notes: payload.notes ?? null, total_value: totalValue, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (updErr) throw updErr
    return updated
  },

  // Atomic: decrements inventory + logs stock_movements for every line item,
  // then flips status to 'shipped'. See ship_supplier_return in migration 044.
  async ship(id: string, businessId: string, branchId: string, userId: string) {
    const { data: ret, error: retErr } = await db('supplier_returns')
      .select('id, status')
      .eq('id', id)
      .eq('business_id', businessId)
      .eq('branch_id', branchId)
      .single()
    if (retErr) throw retErr
    if (ret.status !== 'draft') throw new Error('Only a draft return can be shipped')

    const { error } = await rpc('ship_supplier_return', { p_return_id: id, p_user_id: userId })
    if (error) throw new Error(error.message ?? 'Failed to ship return')
    return this.getById(id, businessId)
  },

  async cancel(id: string, businessId: string, branchId: string, userId: string) {
    const { data: ret, error: retErr } = await db('supplier_returns')
      .select('id, status')
      .eq('id', id)
      .eq('business_id', businessId)
      .eq('branch_id', branchId)
      .single()
    if (retErr) throw retErr

    if (ret.status === 'draft') {
      // Guarded on status='draft' rather than trusting the read above: if the
      // return was shipped by someone else in the moment between that SELECT
      // and this UPDATE, we must NOT silently cancel it via this no-op path —
      // that would mark a shipped return 'cancelled' without ever reversing
      // its inventory decrement. Falling through to "not draft anymore" makes
      // the caller retry, which correctly takes the cancel_shipped_supplier_return
      // branch instead.
      const { data: updated, error } = await db('supplier_returns')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'draft')
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!updated) throw new Error('This return is no longer a draft — refresh and try again')
    } else if (ret.status === 'shipped') {
      const { error } = await rpc('cancel_shipped_supplier_return', { p_return_id: id, p_user_id: userId })
      if (error) throw new Error(error.message ?? 'Failed to cancel return')
    } else {
      throw new Error(`A ${ret.status} return cannot be cancelled`)
    }

    return this.getById(id, businessId)
  },

  // Records what the supplier gave back for the damaged goods. A credit or
  // refund against a tracked PO is also posted through record_supplier_payment
  // so it reduces the outstanding balance shown on that PO / supplier statement.
  async resolve(id: string, businessId: string, payload: {
    resolution_type: 'replacement' | 'credit' | 'refund'
    resolution_amount?: number | null
    resolution_note?: string | null
  }, userId: string) {
    const { data: ret, error: retErr } = await db('supplier_returns')
      .select('*')
      .eq('id', id)
      .eq('business_id', businessId)
      .single()
    if (retErr) throw retErr
    if (ret.status !== 'shipped') throw new Error('Only a shipped return can be resolved')

    const amount = payload.resolution_amount ?? 0

    // Claim the resolution with a guarded UPDATE (status = 'shipped') BEFORE
    // posting any payment. If two "Resolve" requests race for the same
    // return, only one can match this WHERE clause — the loser stops here
    // instead of also calling recordPayment, which would otherwise post the
    // credit/refund twice against the supplier's balance.
    const { data: updated, error: updErr } = await db('supplier_returns')
      .update({
        status: 'resolved',
        resolution_type: payload.resolution_type,
        resolution_amount: amount,
        resolution_note: payload.resolution_note ?? null,
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'shipped')
      .select()
      .maybeSingle()
    if (updErr) throw updErr
    if (!updated) throw new Error('This return is no longer awaiting resolution — refresh and try again')

    if ((payload.resolution_type === 'credit' || payload.resolution_type === 'refund') && amount > 0 && ret.po_id) {
      try {
        await PurchaseOrderService.recordPayment(
          ret.po_id,
          amount,
          payload.resolution_type === 'credit' ? 'credit_note' : 'refund',
          `Supplier return ${ret.return_number}${payload.resolution_note ? ` — ${payload.resolution_note}` : ''}`,
          businessId,
          userId
        )
      } catch (err) {
        // Posting the payment failed after we'd already claimed the
        // resolution — revert back to 'shipped' rather than leaving the
        // return silently marked resolved with no corresponding payment
        // record, which would be a manual-reconciliation trap later.
        await db('supplier_returns')
          .update({
            status: 'shipped', resolution_type: null, resolution_amount: null,
            resolution_note: null, resolved_by: null, resolved_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
        throw err
      }
    }

    return updated
  },
}
