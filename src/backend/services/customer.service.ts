import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables, UpdateTables } from '@/types/database'

export const CustomerService = {
  async list(businessId: string, params: { page?: number; limit?: number; search?: string }) {
    const { page = 1, limit = 20, search } = params
    let q = adminSupabase
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (search) {
      q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`)
    }

    const { data, error, count } = await q
    if (error) throw error
    return { data, count }
  },

  async getById(id: string, businessId: string) {
    const { data, error } = await adminSupabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .eq('business_id', businessId)
      .single()
    if (error) throw error
    return data
  },

  async getDetail(id: string, businessId: string) {
    const [customerRes, repairsRes, salesRes, invoicesRes] = await Promise.all([
      adminSupabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .eq('business_id', businessId)
        .single(),
      adminSupabase
        .from('repairs')
        .select('id, job_number, status, device_brand, device_model, created_at, actual_cost, estimated_cost')
        .eq('customer_id', id)
        .order('created_at', { ascending: false })
        .limit(50),
      adminSupabase
        .from('sales')
        .select('id, total, payment_method, created_at, is_refund')
        .eq('customer_id', id)
        .eq('is_refund', false)
        .order('created_at', { ascending: false })
        .limit(50),
      adminSupabase
        .from('invoices')
        .select('id, invoice_number, total, status, created_at')
        .eq('customer_id', id)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    if (customerRes.error) throw customerRes.error

    const totalSpend = (salesRes.data ?? []).reduce((s, r) => s + (r.total ?? 0), 0)

    return {
      ...customerRes.data,
      repairs: repairsRes.data ?? [],
      sales: salesRes.data ?? [],
      invoices: invoicesRes.data ?? [],
      stats: {
        repair_count: (repairsRes.data ?? []).length,
        sale_count: (salesRes.data ?? []).length,
        invoice_count: (invoicesRes.data ?? []).length,
        total_spend: totalSpend,
      },
    }
  },

  async create(payload: InsertTables<'customers'>) {
    const { data, error } = await adminSupabase.from('customers').insert(payload).select().single()
    if (error) throw error
    return data
  },

  async update(id: string, businessId: string, payload: UpdateTables<'customers'>) {
    const { data, error } = await adminSupabase
      .from('customers')
      .update(payload)
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()
    if (error) throw error
    return data
  },
}
