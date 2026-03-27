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
}

// ── Purchase Orders ──────────────────────────────────────────────────────────

export const PurchaseOrderService = {
  async list(businessId: string, branchId: string, params: { status?: string; page?: number; limit?: number }) {
    const { page = 1, limit = 20, status } = params
    let q = adminSupabase
      .from('purchase_orders')
      .select('*, suppliers(name), purchase_order_items(id)', { count: 'exact' })
      .eq('business_id', businessId)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (status) q = q.eq('status', status)

    const { data, error, count } = await q
    if (error) throw error
    return { data, count }
  },

  async getById(id: string, businessId: string) {
    const { data, error } = await adminSupabase
      .from('purchase_orders')
      .select('*, suppliers(*), purchase_order_items(*, products(name, sku))')
      .eq('id', id)
      .eq('business_id', businessId)
      .single()
    if (error) throw error
    return data
  },

  async create(businessId: string, branchId: string, payload: {
    supplier_id: string; notes?: string; expected_delivery_date?: string
    items: Array<{ product_id?: string; name: string; sku?: string; quantity_ordered: number; unit_cost: number }>
    created_by?: string
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

    return po
  },

  async updateStatus(id: string, businessId: string, status: string) {
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

  async update(id: string, businessId: string, payload: {
    supplier_id?: string; notes?: string | null; expected_delivery_date?: string | null
    items?: Array<{ product_id?: string; name: string; sku?: string; quantity_ordered: number; unit_cost: number }>
  }) {
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
      .select('*, suppliers(*), purchase_order_items(*, products(name, sku))')
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
      items: original.purchase_order_items.map((i: { product_id: string | null; name: string; sku: string | null; quantity_ordered: number; unit_cost: number }) => ({
        product_id: i.product_id ?? undefined,
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

    // Atomic processing: updates inventory + stock_movements + PO status
    const { error: processErr } = await rpc('process_grn', {
      p_grn_id: grn.id, p_user_id: receivedBy,
    })
    if (processErr) throw processErr

    // Populate cost layers and update average cost for each received product
    const { data: grnItems } = await db('grn_items')
      .select('quantity_received, purchase_order_items(product_id, unit_cost)')
      .eq('grn_id', grn.id)

    if (grnItems && grnItems.length > 0) {
      const costLayers = (grnItems as any[])
        .filter((gi) => {
          const poi = gi.purchase_order_items as { product_id: string; unit_cost: number } | null
          return poi?.product_id && gi.quantity_received > 0
        })
        .map((gi) => {
          const poi = gi.purchase_order_items as { product_id: string; unit_cost: number }
          return {
            product_id: poi.product_id,
            branch_id: branchId,
            quantity: gi.quantity_received,
            unit_cost: poi.unit_cost,
            source_id: grn.id,
            source_type: 'grn' as const,
          }
        })

      if (costLayers.length > 0) {
        await db('inventory_cost_layers').insert(costLayers)
        await Promise.all(
          costLayers.map((c) =>
            adminSupabase.rpc('update_average_cost', {
              p_product_id: c.product_id,
              p_new_qty:    c.quantity,
              p_new_cost:   c.unit_cost,
            })
          )
        )
      }
    }

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
