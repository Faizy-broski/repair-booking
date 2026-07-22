import { adminSupabase } from '@/backend/config/supabase'
import { RepairService } from '@/backend/services/repair.service'
import type { Json } from '@/types/database'

export interface PaymentSplit {
  method: 'cash' | 'card' | 'gift_card' | 'ebay' | 'deliveroo' | 'website'
  amount: number
}

export interface ExchangeItem {
  product_id?: string | null
  variant_id?: string | null
  name: string
  quantity: number
  unit_price: number
  total: number
  is_service?: boolean
}

export interface ExchangePayload {
  original_sale_id: string
  branch_id: string
  cashier_id: string
  customer_id?: string | null
  returned_items: ExchangeItem[]
  new_items: ExchangeItem[]
  payment_method: 'cash' | 'card' | 'on_account'
  amount_paid?: number
}

export interface ExchangeResult {
  refund_id: string
  exchange_sale_id: string
  returned_total: number
  new_total: number
  net_difference: number
}

export interface SalePayload {
  branch_id: string
  cashier_id: string
  customer_id?: string | null
  employee_id?: string | null
  subtotal: number
  discount: number
  tax: number
  total: number
  payment_method: string
  amount_paid?: number
  payment_splits?: PaymentSplit[]
  gift_card_id?: string | null
  gift_card_amount?: number
  store_credit_amount?: number
  loyalty_points_used?: number
  notes?: string | null
  items: {
    product_id?: string | null
    repair_id?: string | null
    variant_id?: string | null
    name: string
    quantity: number
    unit_price: number
    discount: number
    total: number
    is_service?: boolean
  }[]
}

export const PosService = {
  async processSale(payload: SalePayload): Promise<string> {
    const { data, error } = await adminSupabase.rpc('process_sale', {
      p_sale_data: payload as unknown as Json,
    })
    if (error) throw error
    return data as string
  },

  async recordCreditPayment(saleId: string, amount: number, method: string, businessId: string, createdBy: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (adminSupabase.rpc as any)('record_credit_payment', {
      p_sale_id: saleId,
      p_amount: amount,
      p_method: method,
      p_business_id: businessId,
      p_created_by: createdBy,
    })
    if (error) throw error
  },

  async getCustomerCreditPayments(customerId: string, params: { from?: string; to?: string } = {}) {
    let salesQ = adminSupabase
      .from('sales')
      .select('id, sale_number, total, amount_paid, payment_status, created_at')
      .eq('customer_id', customerId)
      .eq('payment_method', 'on_account')
      .order('created_at', { ascending: false })
    if (params.from) salesQ = salesQ.gte('created_at', params.from)
    if (params.to) salesQ = salesQ.lte('created_at', params.to)

    const { data: sales, error: salesErr } = await salesQ
    if (salesErr) throw salesErr

    const saleIds = (sales ?? []).map((s: any) => s.id)
    let payments: any[] = []
    if (saleIds.length > 0) {
      const { data, error } = await (adminSupabase as any)
        .from('sale_payments')
        .select('id, sale_id, amount, method, created_at, is_backfilled')
        .in('sale_id', saleIds)
        .order('created_at', { ascending: true })
      if (error) throw error
      payments = data ?? []
    }

    return (sales ?? []).map((s: any) => ({
      ...s,
      payments: payments.filter((p) => p.sale_id === s.id),
    }))
  },

  async getSales(branchId: string, params: { page?: number; limit?: number; from?: string; to?: string; status?: string; search?: string; paymentMethod?: string; outstandingOnly?: boolean; employeeId?: string; employeePurchasesOnly?: boolean }) {
    const { page = 1, limit = 20, from, to, status, search, paymentMethod, outstandingOnly, employeeId, employeePurchasesOnly } = params
    let q = adminSupabase
      .from('sales')
      .select('*, customers(first_name,last_name), profiles!cashier_id(full_name), employees!sales_employee_id_fkey(first_name,last_name), sale_items(name,quantity)', { count: 'exact' })
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (from) q = q.gte('created_at', from)
    if (to) q = q.lte('created_at', to)
    if (status) q = q.eq('payment_status', status)
    if (paymentMethod) q = q.eq('payment_method', paymentMethod)
    if (outstandingOnly) q = q.neq('payment_status', 'paid')
    if (employeeId) q = q.eq('employee_id', employeeId)
    if (employeePurchasesOnly) q = q.not('employee_id', 'is', null)
    if (search) {
      const term = `%${search}%`
      // Resolve customer IDs matching the name first (PostgREST can't filter
      // on foreign table columns inside .or())
      const { data: matched } = await adminSupabase
        .from('customers')
        .select('id')
        .or(`first_name.ilike.${term},last_name.ilike.${term}`)
      const customerIds = (matched ?? []).map((c: { id: string }) => c.id)

      // sale_number is a generated TEXT column (last 8 chars of UUID, uppercase)
      if (customerIds.length > 0) {
        q = q.or(`sale_number.ilike.${term},customer_id.in.(${customerIds.join(',')})`)
      } else {
        q = q.ilike('sale_number', term)
      }
    }

    const { data, error, count } = await q
    if (error) throw error
    return { data, count }
  },

  // Unified feed for the Sales page: sales/refunds/exchanges + register cash
  // in/out, merged and paginated in the DB via get_sales_ledger (migration 158).
  async getSalesLedger(branchId: string, params: { page?: number; limit?: number; from?: string; to?: string; type?: string; status?: string; search?: string }) {
    const { page = 1, limit = 20, from, to, type, status, search } = params

    let customerIds: string[] | null = null
    if (search) {
      const term = `%${search}%`
      const { data: matched } = await adminSupabase
        .from('customers')
        .select('id')
        .or(`first_name.ilike.${term},last_name.ilike.${term}`)
      customerIds = (matched ?? []).map((c: { id: string }) => c.id)
      if (customerIds.length === 0) customerIds = null
    }

    const { data, error } = await (adminSupabase as any).rpc('get_sales_ledger', {
      p_branch_id: branchId,
      p_from: from ?? null,
      p_to: to ?? null,
      p_type: type ?? null,
      p_status: status ?? null,
      p_search: search ?? null,
      p_customer_ids: customerIds,
      p_limit: limit,
      p_offset: (page - 1) * limit,
    })
    if (error) throw error

    const rows = (data ?? []) as Array<Record<string, unknown> & { total_count: number }>
    const total = rows.length > 0 ? Number(rows[0].total_count) : 0

    const cashierIds = [...new Set(rows.map(r => r.cashier_id).filter(Boolean))] as string[]
    const customerRowIds = [...new Set(rows.map(r => r.customer_id).filter(Boolean))] as string[]
    const [{ data: cashiers }, { data: customers }] = await Promise.all([
      cashierIds.length
        ? adminSupabase.from('profiles').select('id, full_name').in('id', cashierIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
      customerRowIds.length
        ? adminSupabase.from('customers').select('id, first_name, last_name').in('id', customerRowIds)
        : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string | null }[] }),
    ])
    const cashierMap = new Map((cashiers ?? []).map(c => [c.id, c]))
    const customerMap = new Map((customers ?? []).map(c => [c.id, c]))

    const enriched = rows.map(r => ({
      ...r,
      total: r.amount, // alias so the Sales table's existing `total` column works for every record type
      profiles: r.cashier_id ? { full_name: cashierMap.get(r.cashier_id as string)?.full_name ?? null } : null,
      customers: r.customer_id ? (() => {
        const c = customerMap.get(r.customer_id as string)
        return c ? { first_name: c.first_name, last_name: c.last_name } : null
      })() : null,
    }))

    return { data: enriched, count: total }
  },

  async deleteCashMovement(id: string, branchId: string | null) {
    const { data: movement, error: fetchError } = await (adminSupabase as any)
      .from('cash_movements').select('id, purpose, branch_id').eq('id', id).single()
    if (fetchError) throw fetchError
    if (branchId && movement.branch_id !== branchId) throw new Error('Cash movement not found')
    if (movement.purpose && movement.purpose !== 'plain') {
      throw new Error('This cash movement is linked to an expense or buyback record and cannot be deleted here')
    }
    const { error } = await (adminSupabase as any).from('cash_movements').delete().eq('id', id)
    if (error) throw error
  },

  async getSalesStats(branchId: string, params: { from?: string; to?: string; status?: string }) {
    const { from, to, status } = params
    let q = adminSupabase
      .from('sales')
      .select('total, is_refund, payment_method, payment_splits')
      .eq('branch_id', branchId)

    if (from) q = q.gte('created_at', from)
    if (to) q = q.lte('created_at', to)
    if (status) q = q.eq('payment_status', status)

    const { data, error } = await q
    if (error) throw error

    const rows = data ?? []
    const sales = rows.filter(r => !r.is_refund)
    const refunds = rows.filter(r => r.is_refund)
    const stats = {
      sales_count: sales.length,
      revenue: sales.reduce((s, r) => s + Number(r.total), 0),
      refund_count: refunds.length,
      refund_amount: refunds.reduce((s, r) => s + Number(r.total), 0),
      cash_total: 0,
      card_total: 0,
      cash_in_total: 0,
      cash_out_total: 0,
    }

    // Cash/card breakdown — used by the retail template's Sales page cards.
    for (const r of sales) {
      if (r.payment_method === 'cash') {
        stats.cash_total += Number(r.total)
      } else if (r.payment_method === 'card') {
        stats.card_total += Number(r.total)
      } else if (r.payment_method === 'split' && Array.isArray(r.payment_splits)) {
        for (const s of r.payment_splits as { method: string; amount: number }[]) {
          if (s.method === 'cash') stats.cash_total += Number(s.amount)
          else if (s.method === 'card') stats.card_total += Number(s.amount)
        }
      }
    }

    // Cash In adds to Sales revenue, Cash Out subtracts — same window/branch.
    let cashQ = (adminSupabase as any)
      .from('cash_movements')
      .select('type, amount')
      .eq('branch_id', branchId)
    if (from) cashQ = cashQ.gte('created_at', from)
    if (to) cashQ = cashQ.lte('created_at', to)
    const { data: cashRows } = await cashQ
    for (const r of (cashRows ?? []) as any[]) {
      if (r.type === 'cash_in') stats.cash_in_total += Number(r.amount)
      else stats.cash_out_total += Number(r.amount)
    }
    stats.revenue += stats.cash_in_total - stats.cash_out_total

    // Repair job revenue (deposits/final charges) has no `sales` row unless
    // paid off through the POS cart — fold it in here so the Sales page
    // totals reflect real revenue collected via the Repairs module too.
    // Skipped when filtering by a `sales.payment_status` value, since repairs
    // have no equivalent status to filter on.
    if (!status) {
      const repairStats = await RepairService.getRevenueStats(branchId, { from, to })
      stats.sales_count   += repairStats.count
      stats.revenue       += repairStats.revenue
      stats.refund_count  += repairStats.refundCount
      stats.refund_amount += repairStats.refundAmount
    }

    return stats
  },

  async getSaleById(id: string, branchId: string | null) {
    let q = adminSupabase
      .from('sales')
      .select('*, sale_items(*), customers(*), profiles!cashier_id(full_name), branches!branch_id(name,address,phone,email,logo_url)')
      .eq('id', id)
    if (branchId) q = q.eq('branch_id', branchId)
    const { data, error } = await q.single()
    if (error) throw error

    // Fetch refund records separately to avoid unreliable self-join
    const { data: refundRecords } = await adminSupabase
      .from('sales')
      .select('id, is_refund, total, sale_items(name, quantity)')
      .eq('original_sale_id', id)
      .eq('is_refund', true)

    return { ...data, refund_records: refundRecords ?? [] }
  },

  async deleteSale(saleId: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (adminSupabase.rpc as any)('delete_sale', { p_sale_id: saleId })
    if (error) throw error
  },

  async updateSale(
    saleId: string,
    payload: {
      customer_id?: string | null
      payment_method?: string
      payment_status?: string
      notes?: string | null
      discount?: number
      tax?: number
      items?: Array<{
        id: string
        quantity: number
        unit_price: number
        discount: number
        total: number
      }>
    },
    businessId: string,
    userId: string
  ): Promise<void> {
    // Fetch current sale + items; verify it belongs to this business via branches join
    const { data: currentSale, error: fetchErr } = await adminSupabase
      .from('sales')
      .select('*, sale_items(*), branches!branch_id(business_id)')
      .eq('id', saleId)
      .single()
    if (fetchErr || !currentSale) throw new Error('Sale not found')
    const saleBusinessId = (currentSale as any).branches?.business_id
    if (saleBusinessId && saleBusinessId !== businessId) throw new Error('Sale not found')
    if ((currentSale as any).is_refund) throw new Error('Cannot edit a refund record')
    // Use the sale's own branch_id for downstream inventory operations
    const branchId: string = (currentSale as any).branch_id

    const currentItems: any[] = (currentSale as any).sale_items ?? []

    // Handle item updates if provided
    if (payload.items && payload.items.length > 0) {
      for (const updItem of payload.items) {
        const orig = currentItems.find((i: any) => i.id === updItem.id)
        if (!orig) continue

        // Update sale_item row
        const { error: itemErr } = await adminSupabase
          .from('sale_items')
          .update({
            quantity: updItem.quantity,
            unit_price: updItem.unit_price,
            discount: updItem.discount,
            total: updItem.total,
          })
          .eq('id', updItem.id)
        if (itemErr) throw itemErr

        // Adjust inventory for product items when quantity changes
        const qtyDelta = updItem.quantity - orig.quantity
        if (qtyDelta !== 0 && orig.product_id) {
          const { data: inv } = await adminSupabase
            .from('inventory')
            .select('id, quantity')
            .eq('branch_id', branchId)
            .eq('product_id', orig.product_id)
            .maybeSingle()

          if (inv) {
            // Negative delta = sold more, deduct; positive delta = sold less, restore
            const newQty = Math.max(0, (inv as any).quantity - qtyDelta)
            await adminSupabase.from('inventory').update({ quantity: newQty }).eq('id', (inv as any).id)
            await adminSupabase.from('stock_movements').insert({
              branch_id: branchId,
              product_id: orig.product_id,
              variant_id: orig.variant_id ?? null,
              type: 'adjustment',
              quantity: -qtyDelta,
              note: `Sale edit: qty changed from ${orig.quantity} to ${updItem.quantity} on sale ${saleId.slice(-8).toUpperCase()}`,
              created_by: userId,
            })
          }
        }
      }

      // Recalculate subtotal from updated items
      const { data: freshItems } = await adminSupabase.from('sale_items').select('total').eq('sale_id', saleId)
      const newSubtotal = (freshItems ?? []).reduce((s: number, i: any) => s + Number(i.total), 0)
      const disc = payload.discount ?? Number((currentSale as any).discount ?? 0)
      const tax = payload.tax ?? Number((currentSale as any).tax ?? 0)
      const newTotal = newSubtotal - disc + tax
      payload = { ...payload, discount: disc, tax, subtotal: newSubtotal, total: newTotal } as any
    }

    // Build sale-level update
    const saleUpdate: Record<string, any> = {}
    if (payload.customer_id !== undefined) saleUpdate.customer_id = payload.customer_id
    if (payload.payment_method !== undefined) saleUpdate.payment_method = payload.payment_method
    if (payload.payment_status !== undefined) saleUpdate.payment_status = payload.payment_status
    if (payload.notes !== undefined) saleUpdate.notes = payload.notes
    if ((payload as any).subtotal !== undefined) saleUpdate.subtotal = (payload as any).subtotal
    if (payload.discount !== undefined) saleUpdate.discount = payload.discount
    if (payload.tax !== undefined) saleUpdate.tax = payload.tax
    if ((payload as any).total !== undefined) saleUpdate.total = (payload as any).total

    if (Object.keys(saleUpdate).length > 0) {
      const { error: updateErr } = await adminSupabase.from('sales').update(saleUpdate).eq('id', saleId)
      if (updateErr) throw updateErr
    }
  },

  async processExchange(payload: ExchangePayload): Promise<ExchangeResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (adminSupabase.rpc as any)('process_exchange', { p_data: payload })
    if (error) throw error
    return data as ExchangeResult
  },

  async processRefund(payload: {
    original_sale_id: string
    branch_id: string
    cashier_id: string
    customer_id?: string | null
    subtotal: number
    tax: number
    total: number
    payment_method: string
    refund_reason?: string | null
    items: {
      product_id?: string | null
      variant_id?: string | null
      name: string
      quantity: number
      unit_price: number
      total: number
      is_service?: boolean
    }[]
  }): Promise<string> {
    const { data, error } = await adminSupabase.rpc('process_refund', {
      p_refund_data: payload as unknown as import('@/types/database').Json,
    })
    if (error) throw error
    return data as string
  },
}
