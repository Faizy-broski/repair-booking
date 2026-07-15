import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables, UpdateTables } from '@/types/database'

const db = (table: string): any => (adminSupabase as any).from(table)
const rpc = (fn: string, args?: Record<string, unknown>) => (adminSupabase as any).rpc(fn, args)

// ── Suppliers ────────────────────────────────────────────────────────────────

export const SupplierService = {
  async list(businessId: string) {
    const { data, error } = await adminSupabase
      .from('suppliers')
      .select('*')
      .eq('business_id', businessId)
      .order('name', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async getById(id: string, businessId: string) {
    const { data, error } = await adminSupabase
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .eq('business_id', businessId)
      .single()
    if (error) throw error
    return data
  },

  async create(payload: InsertTables<'suppliers'>) {
    const { data, error } = await db('suppliers').insert(payload).select().single()
    if (error) throw error
    return data
  },

  async update(id: string, businessId: string, payload: UpdateTables<'suppliers'>) {
    const { data, error } = await db('suppliers').update(payload).eq('id', id).eq('business_id', businessId).select().single()
    if (error) throw error
    return data
  },

  async remove(id: string, businessId: string) {
    const { error } = await adminSupabase.from('suppliers').delete().eq('id', id).eq('business_id', businessId)
    if (error) throw error
  },

  async getPaymentHistory(supplierId: string, params: { from?: string; to?: string } = {}) {
    let posQ = adminSupabase
      .from('purchase_orders')
      .select('id, po_number, total, amount_paid, payment_status, status, created_at')
      .eq('supplier_id', supplierId)
      .eq('status', 'received')
      .order('created_at', { ascending: false })
    if (params.from) posQ = posQ.gte('created_at', params.from)
    if (params.to) posQ = posQ.lte('created_at', params.to)

    const { data: pos, error: posErr } = await posQ
    if (posErr) throw posErr

    const poIds = (pos ?? []).map((p: any) => p.id)
    let payments: any[] = []
    if (poIds.length > 0) {
      const { data, error } = await db('supplier_payments')
        .select('id, purchase_order_id, amount, method, created_at')
        .in('purchase_order_id', poIds)
        .order('created_at', { ascending: true })
      if (error) throw error
      payments = data ?? []
    }

    return (pos ?? []).map((p: any) => ({
      ...p,
      payments: payments.filter((pay) => pay.purchase_order_id === p.id),
    }))
  },

  async getReceiptData(poId: string, businessId: string, paymentId?: string) {
    const { data: po, error: poErr } = await adminSupabase
      .from('purchase_orders')
      .select('id, po_number, total, amount_paid, payment_status, status, created_at, supplier_id, suppliers(name)')
      .eq('id', poId)
      .eq('business_id', businessId)
      .single()
    if (poErr) throw poErr
    if (!po) return null

    const { data: payments, error: payErr } = await db('supplier_payments')
      .select('id, amount, method, created_at')
      .eq('purchase_order_id', poId)
      .order('created_at', { ascending: true })
    if (payErr) throw payErr

    const ordered = payments ?? []
    if (paymentId) {
      const idx = ordered.findIndex((p: any) => p.id === paymentId)
      if (idx !== -1) {
        const cumulativePaidThroughThisPayment = ordered
          .slice(0, idx + 1)
          .reduce((sum: number, p: any) => sum + Number(p.amount), 0)
        return { ...po, payments: [ordered[idx]], amount_paid: cumulativePaidThroughThisPayment }
      }
    }

    return { ...po, payments: ordered }
  },
}

// ── Purchase Orders ──────────────────────────────────────────────────────────

export const PurchaseOrderService = {
  async list(businessId: string, branchId: string, params: { status?: string; page?: number; limit?: number; outstandingOnly?: boolean; supplierId?: string }) {
    const { page = 1, limit = 20, status, outstandingOnly, supplierId } = params
    let q = adminSupabase
      .from('purchase_orders')
      .select('*, suppliers(name), purchase_order_items(id)', { count: 'exact' })
      .eq('business_id', businessId)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (status) q = q.eq('status', status)
    if (outstandingOnly) q = q.eq('status', 'received').neq('payment_status', 'paid')
    if (supplierId) q = q.eq('supplier_id', supplierId)

    const { data, error, count } = await q
    if (error) throw error
    return { data, count }
  },

  async recordPayment(poId: string, amount: number, method: string, note: string | undefined, businessId: string, createdBy?: string): Promise<void> {
    const { error } = await (adminSupabase.rpc as any)('record_supplier_payment', {
      p_po_id: poId,
      p_amount: amount,
      p_method: method,
      p_note: note ?? null,
      p_business_id: businessId,
      p_created_by: createdBy ?? null,
    })
    if (error) throw error
  },

  async getById(id: string, businessId: string) {
    const { data, error } = await adminSupabase
      .from('purchase_orders')
      .select('*, suppliers(*), purchase_order_items(*, products(name, sku), product_variants(name))')
      .eq('id', id)
      .eq('business_id', businessId)
      .single()
    if (error) throw error
    return data
  },

  async create(businessId: string, branchId: string, payload: {
    supplier_id: string; notes?: string; expected_delivery_date?: string
    items: Array<{ product_id?: string; variant_id?: string; name: string; sku?: string; quantity_ordered: number; unit_cost: number }>
    created_by?: string
    deposit?: { amount: number; method: string; note?: string }
  }) {
    const { data: poNum } = await rpc('generate_po_number', { p_branch_id: branchId })

    const subtotal = payload.items.reduce((s, i) => s + i.quantity_ordered * i.unit_cost, 0)
    const total    = subtotal

    const { data: po, error: poErr } = await db('purchase_orders')
      .insert({
        business_id: businessId,
        branch_id:   branchId,
        supplier_id: payload.supplier_id,
        po_number:   poNum,
        notes:       payload.notes ?? null,
        expected_delivery_date: payload.expected_delivery_date ?? null,
        subtotal,
        total,
        created_by: payload.created_by ?? null,
      })
      .select()
      .single()
    if (poErr) throw poErr

    const { error: itemsErr } = await db('purchase_order_items')
      .insert(payload.items.map((i) => ({ ...i, po_id: po.id })))
    if (itemsErr) throw itemsErr

    // An upfront deposit paid to the supplier when placing the order — same
    // "pay something now, settle the rest later" pattern already used for
    // repair/credit-sale deposits. record_supplier_payment (relaxed in
    // migration 144) allows this while the PO is still draft.
    if (payload.deposit && payload.deposit.amount > 0) {
      await this.recordPayment(po.id, payload.deposit.amount, payload.deposit.method, payload.deposit.note, businessId, payload.created_by)
    }

    return po
  },

  async updateStatus(id: string, businessId: string, status: string) {
    // "received" must only ever be reached by actually receiving stock
    // (GrnService.create -> process_grn), which is what updates inventory,
    // cost layers, and PO status together atomically. Allowing it here would
    // let a PO silently claim to be received without any of that happening.
    if (status === 'received') {
      throw new Error('Received status can only be set by receiving stock — use Receive Stock instead')
    }

    const { data, error } = await db('purchase_orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async cancel(id: string, businessId: string) {
    return this.updateStatus(id, businessId, 'cancelled')
  },

  async remove(id: string, businessId: string) {
    const { data: po, error: fetchErr } = await adminSupabase
      .from('purchase_orders')
      .select('id, status')
      .eq('id', id)
      .eq('business_id', businessId)
      .single()
    if (fetchErr) throw fetchErr
    if (!po) throw new Error('Purchase order not found')

    // delete_purchase_order (migration 143) fully reverses whatever this PO
    // already did — any inventory its GRN(s) added is subtracted back out,
    // the cost layers/stock movements those GRNs created are removed, and any
    // supplier_payments record is deleted along with the order. Safe to call
    // regardless of status: a draft/pending/cancelled PO with no GRNs simply
    // has nothing to reverse.
    const { error } = await rpc('delete_purchase_order', { p_po_id: id })
    if (error) throw error
  },

  async update(id: string, businessId: string, payload: {
    supplier_id?: string; notes?: string | null; expected_delivery_date?: string | null
    items?: Array<{ product_id?: string; variant_id?: string; name: string; sku?: string; quantity_ordered: number; unit_cost: number }>
  }) {
    // Line items can only be replaced while nothing has been received yet —
    // once GRN/receiving has happened, quantity_received and the total tied
    // to any supplier_payments would desync from a silent item rewrite. Also
    // block it once a deposit has been recorded — a lower rewritten total
    // could end up less than what's already been paid.
    if (payload.items) {
      const { data: existing, error: fetchErr } = await adminSupabase
        .from('purchase_orders').select('status, amount_paid').eq('id', id).eq('business_id', businessId).single()
      if (fetchErr) throw fetchErr
      if ((existing as any)?.status !== 'draft') {
        throw new Error('Only draft purchase orders can have their line items edited')
      }
      if (Number((existing as any)?.amount_paid ?? 0) > 0) {
        throw new Error('Cannot edit line items after a deposit has been recorded against this order')
      }
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (payload.supplier_id !== undefined) updates.supplier_id = payload.supplier_id
    if (payload.notes !== undefined) updates.notes = payload.notes
    if (payload.expected_delivery_date !== undefined) updates.expected_delivery_date = payload.expected_delivery_date

    if (payload.items) {
      const subtotal = payload.items.reduce((s, i) => s + i.quantity_ordered * i.unit_cost, 0)
      updates.subtotal = subtotal
      updates.total = subtotal

      // Replace all items: delete old, insert new
      const { error: delErr } = await adminSupabase
        .from('purchase_order_items').delete().eq('po_id', id)
      if (delErr) throw delErr

      const { error: insErr } = await db('purchase_order_items')
        .insert(payload.items.map((i) => ({ ...i, po_id: id })))
      if (insErr) throw insErr
    }

    const { data, error } = await db('purchase_orders')
      .update(updates)
      .eq('id', id)
      .eq('business_id', businessId)
      .select('*, suppliers(*), purchase_order_items(*, products(name, sku), product_variants(name))')
      .single()
    if (error) throw error
    return data
  },

  async clone(id: string, businessId: string, branchId: string, createdBy?: string) {
    const original = await this.getById(id, businessId) as any
    if (!original) throw new Error('Purchase order not found')

    return this.create(businessId, branchId, {
      supplier_id: original.supplier_id,
      notes: original.notes ?? undefined,
      expected_delivery_date: undefined,
      items: original.purchase_order_items.map((i: { product_id: string | null; variant_id: string | null; name: string; sku: string | null; quantity_ordered: number; unit_cost: number }) => ({
        product_id: i.product_id ?? undefined,
        variant_id: i.variant_id ?? undefined,
        name: i.name,
        sku: i.sku ?? undefined,
        quantity_ordered: i.quantity_ordered,
        unit_cost: i.unit_cost,
      })),
      created_by: createdBy,
    })
  },

  async createFromLowStock(businessId: string, branchId: string, supplierId: string, items: Array<{ product_id: string; quantity: number }>, createdBy?: string) {
    // Lookup product names/skus/cost  for each item
    const productIds = items.map((i) => i.product_id)
    const { data: products, error: prodErr } = await adminSupabase
      .from('products')
      .select('id, name, sku, cost_price')
      .in('id', productIds)
    if (prodErr) throw prodErr

    const productMap = new Map(((products ?? []) as any[]).map((p) => [p.id, p]))

    const poItems = items
      .map((i) => {
        const product = productMap.get(i.product_id)
        if (!product) return null
        return {
          product_id: i.product_id,
          name: product.name,
          sku: product.sku ?? undefined,
          quantity_ordered: i.quantity,
          unit_cost: product.cost_price ?? 0,
        }
      })
      .filter((i): i is NonNullable<typeof i> => i !== null)

    if (poItems.length === 0) throw new Error('No valid products found')

    return this.create(businessId, branchId, {
      supplier_id: supplierId,
      notes: 'Auto-generated from low stock report',
      items: poItems,
      created_by: createdBy,
    })
  },
}

// ── GRN ──────────────────────────────────────────────────────────────────────

export const GrnService = {
  async create(businessId: string, branchId: string, poId: string, receivedBy: string, items: Array<{ po_item_id: string; quantity_received: number; notes?: string }>, notes?: string) {
    const { data: grn, error: grnErr } = await db('goods_receiving_notes')
      .insert({ business_id: businessId, branch_id: branchId, po_id: poId, received_by: receivedBy, notes: notes ?? null })
      .select()
      .single()
    if (grnErr) throw grnErr

    const { error: itemsErr } = await db('grn_items')
      .insert(items.map((i) => ({ grn_id: grn.id, ...i })))
    if (itemsErr) throw itemsErr

    // Atomic processing: updates inventory (variant-aware) + stock_movements +
    // cost layers / average cost + PO status, all inside one RPC transaction.
    // This used to be duplicated here in JS too (a second inventory_cost_layers
    // insert + a second update_average_cost call for every item), which
    // double-counted stock value on every GRN — process_grn is now the sole
    // writer for all of this.
    const { error: processErr } = await rpc('process_grn', {
      p_grn_id: grn.id, p_user_id: receivedBy,
    })
    if (processErr) throw processErr

    return grn
  },
}

// ── Special Orders ───────────────────────────────────────────────────────────

export const SpecialOrderService = {
  async list(businessId: string, params: { status?: string }) {
    let q = adminSupabase
      .from('special_orders')
      .select('*, customers(first_name,last_name), repairs(job_number), products(name)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (params.status) q = q.eq('status', params.status)

    const { data, error } = await q
    if (error) throw error
    return data ?? []
  },

  async create(payload: InsertTables<'special_orders'>) {
    const { data, error } = await adminSupabase.from('special_orders').insert(payload).select().single()
    if (error) throw error
    return data
  },

  async updateStatus(id: string, businessId: string, status: string, trackingId?: string) {
    const { data, error } = await adminSupabase
      .from('special_orders')
      .update({ status, ...(trackingId ? { tracking_id: trackingId } : {}) })
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()
    if (error) throw error
    return data
  },
}
