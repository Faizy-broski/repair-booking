import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables } from '@/types/database'

const db = (t: string): any => (adminSupabase as any).from(t)
const rpc = (fn: string, args?: Record<string, unknown>): any => (adminSupabase as any).rpc(fn, args)

export const InvoiceService = {
  async list(branchId: string, params: { page?: number; limit?: number; status?: string; customer_id?: string }) {
    const { page = 1, limit = 20, status, customer_id } = params
    let q = adminSupabase
      .from('invoices')
      .select('*, customers(first_name,last_name)', { count: 'exact' })
      .eq('branch_id', branchId)
      .order('issued_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (status) q = q.eq('status', status)
    if (customer_id) q = q.eq('customer_id', customer_id)

    const { data, error, count } = await q
    if (error) throw error
    return { data, count }
  },

  async getById(id: string, branchId: string) {
    const { data, error } = await adminSupabase
      .from('invoices')
      .select('*, customers(*), branches(name,address,phone,email)')
      .eq('id', id)
      .eq('branch_id', branchId)
      .single()
    if (error) throw error
    return data
  },

  async create(payload: Omit<InsertTables<'invoices'>, 'invoice_number'> & { branch_id: string; created_by?: string }) {
    const { branch_id, ...rest } = payload
    const { data: invNum } = await rpc('generate_invoice_number', {
      p_branch_id: branch_id,
    })

    const { data, error } = await db('invoices')
      .insert({ ...rest, invoice_number: invNum, branch_id })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateStatus(id: string, branchId: string | null, status: string) {
    let q = adminSupabase.from('invoices').update({ status }).eq('id', id)
    
    if (branchId && branchId !== 'null') {
      q = q.eq('branch_id', branchId)
    }

    const { data, error } = await q.select().single()
    if (error) throw error
    return data
  },

  async recordPayment(id: string, branchId: string | null, amountPaid: number) {
    // First fetch the invoice total to determine new status
    let fetchQ = adminSupabase.from('invoices').select('total, amount_paid').eq('id', id)
    if (branchId && branchId !== 'null') {
      fetchQ = fetchQ.eq('branch_id', branchId)
    }
    
    const { data: inv, error: fetchErr } = await fetchQ.single()
    if (fetchErr) throw fetchErr

    const newAmountPaid = ((inv as any).amount_paid ?? 0) + amountPaid
    const newStatus = newAmountPaid >= (inv as any).total ? 'paid' : 'partial'

    let updateQ = adminSupabase.from('invoices').update({ amount_paid: newAmountPaid, status: newStatus }).eq('id', id)
    if (branchId && branchId !== 'null') {
      updateQ = updateQ.eq('branch_id', branchId)
    }

    const { data, error } = await updateQ.select().single()
    if (error) throw error
    return data
  },

  async getStatusSummary(branchId: string) {
    const { data, error } = await db('invoices')
      .select('status, total')
      .eq('branch_id', branchId)
    if (error) throw error

    const summary = { unpaid: 0, partial: 0, paid: 0, refunded: 0,
                      unpaid_total: 0, partial_total: 0, paid_total: 0 }
    ;((data ?? []) as any[]).forEach((inv: any) => {
      if (inv.status === 'unpaid')   { summary.unpaid++;   summary.unpaid_total   += inv.total ?? 0 }
      if (inv.status === 'partial')  { summary.partial++;  summary.partial_total  += inv.total ?? 0 }
      if (inv.status === 'paid')     { summary.paid++;     summary.paid_total     += inv.total ?? 0 }
      if (inv.status === 'refunded') { summary.refunded++ }
    })
    return summary
  },

  async update(id: string, branchId: string | null, payload: {
    customer_id?: string | null
    items?: Array<{ description: string; quantity: number; unit_price: number }>
    subtotal?: number; discount?: number; tax?: number; total?: number
    notes?: string | null; status?: string
  }) {
    const updates: Record<string, any> = {}
    if (payload.customer_id !== undefined) updates.customer_id = payload.customer_id
    if (payload.items !== undefined) updates.items = payload.items
    if (payload.subtotal !== undefined) updates.subtotal = payload.subtotal
    if (payload.discount !== undefined) updates.discount = payload.discount
    if (payload.tax !== undefined) updates.tax = payload.tax
    if (payload.total !== undefined) updates.total = payload.total
    if (payload.notes !== undefined) updates.notes = payload.notes
    if (payload.status !== undefined) updates.status = payload.status
    let q = adminSupabase.from('invoices').update(updates).eq('id', id)
    if (branchId && branchId !== 'null') q = q.eq('branch_id', branchId)
    const { data, error } = await q.select().single()
    if (error) throw error
    return data
  },

  async delete(id: string, branchId: string | null) {
    let q = adminSupabase.from('invoices').delete().eq('id', id)
    if (branchId && branchId !== 'null') q = q.eq('branch_id', branchId)
    const { error } = await q
    if (error) throw error
  },

  async generatePdf(id: string, businessId?: string): Promise<Buffer> {
    const { data, error } = await adminSupabase
      .from('invoices')
      .select('*, customers(*), branches(id,name,address,phone,email,business_id,logo_url)')
      .eq('id', id)
      .single()
    if (error || !data) throw error ?? new Error('Invoice not found')

    const { renderToBuffer } = await import('@react-pdf/renderer')
    const { InvoicePdf } = await import('@/components/pdf/invoice-pdf')
    const { InvoiceSettingsService } = await import('@/backend/services/invoice-settings.service')
    const React = (await import('react')).default

    const branch = data.branches as any
    const customer = data.customers as any
    const bizId = businessId ?? branch?.business_id
    const items = Array.isArray(data.items) ? (data.items as any[]) : []

    // Fetch branding settings + business currency in parallel
    const [settings, bizRow] = await Promise.all([
      bizId
        ? InvoiceSettingsService.get(bizId, branch?.id ?? null)
        : (await import('@/types/invoice-settings')).DEFAULT_INVOICE_SETTINGS,
      bizId
        ? adminSupabase.from('businesses').select('currency').eq('id', bizId).single().then(r => r.data)
        : Promise.resolve(null),
    ])

    // Use branch logo as fallback if no logo_url in settings
    const effectiveSettings = {
      ...settings,
      logo_url: settings.logo_url ?? branch?.logo_url ?? null,
      show_logo: settings.show_logo !== false && !!(settings.logo_url ?? branch?.logo_url),
    }

    const doc = React.createElement(InvoicePdf, {
      settings: effectiveSettings,
      invoiceNumber: data.invoice_number,
      status: data.status ?? 'unpaid',
      issuedAt: data.issued_at ?? data.created_at,
      dueAt: data.due_at ?? null,
      businessName: branch?.name ?? 'Business',
      branchName: branch?.name ?? null,
      branchAddress: branch?.address ?? null,
      branchPhone: branch?.phone ?? null,
      branchEmail: branch?.email ?? null,
      customerName: customer ? `${customer.first_name} ${customer.last_name ?? ''}`.trim() : '—',
      customerEmail: customer?.email ?? null,
      customerPhone: customer?.phone ?? null,
      customerAddress: customer?.address ?? null,
      items,
      subtotal: data.subtotal ?? 0,
      discount: data.discount ?? 0,
      tax: data.tax ?? 0,
      total: data.total ?? 0,
      amountPaid: data.amount_paid ?? 0,
      notes: data.notes ?? null,
      currency: bizRow?.currency ?? 'GBP',
    })

    return await renderToBuffer(doc as any)
  },
}
