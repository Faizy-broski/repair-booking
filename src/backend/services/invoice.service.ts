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

  async updateStatus(id: string, branchId: string, status: string) {
    const { data, error } = await db('invoices')
      .update({ status })
      .eq('id', id)
      .eq('branch_id', branchId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async recordPayment(id: string, branchId: string, amountPaid: number) {
    // First fetch the invoice total to determine new status
    const { data: inv, error: fetchErr } = await db('invoices')
      .select('total, amount_paid')
      .eq('id', id)
      .eq('branch_id', branchId)
      .single()
    if (fetchErr) throw fetchErr

    const newAmountPaid = ((inv as any).amount_paid ?? 0) + amountPaid
    const newStatus = newAmountPaid >= (inv as any).total ? 'paid' : 'partial'

    const { data, error } = await db('invoices')
      .update({ amount_paid: newAmountPaid, status: newStatus })
      .eq('id', id)
      .eq('branch_id', branchId)
      .select()
      .single()
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

  async generatePdf(id: string): Promise<Buffer> {
    const { data, error } = await adminSupabase
      .from('invoices')
      .select('*, customers(first_name,last_name,email), branches(name,address,phone,email)')
      .eq('id', id)
      .single()
    if (error || !data) throw error ?? new Error('Invoice not found')

    const { renderToBuffer } = await import('@react-pdf/renderer')
    const { InvoicePdf } = await import('@/components/pdf/invoice-pdf')
    const React = (await import('react')).default

    const customer = data.customers as any
    const items: Array<{ description: string; quantity: number; unit_price: number }> =
      Array.isArray(data.items) ? (data.items as any[]) : []

    const doc = React.createElement(InvoicePdf, {
      invoiceNumber: data.invoice_number,
      customerName: customer ? `${customer.first_name} ${customer.last_name ?? ''}` : '—',
      items,
      subtotal: data.subtotal,
      tax: data.tax,
      total: data.total,
    })

    return await renderToBuffer(doc as any)
  },
}
