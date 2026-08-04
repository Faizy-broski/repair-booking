import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables, UpdateTables } from '@/types/database'
import { escapeIlike } from '@/backend/utils/search'
import { normalizePhone } from '@/backend/utils/phone'
import { normalizePlate } from '@/backend/services/vehicle.service'

export const CustomerService = {
  // Used by the call-intake ("find or create by phone") flow — a shared/reused
  // number can legitimately return more than one customer, so callers must
  // handle 0, 1, or many matches rather than assuming uniqueness.
  async findByPhone(businessId: string, phone: string) {
    const normalized = normalizePhone(phone)
    const { data, error } = await adminSupabase
      .from('customers')
      .select('*, vehicles(*)')
      .eq('business_id', businessId)
      .eq('phone', normalized)
    if (error) throw error
    return data ?? []
  },

  async list(businessId: string, params: { page?: number; limit?: number; search?: string }) {
    const { page = 1, limit = 20, search } = params
    // vehicles(registration_number) is a harmless empty array for businesses
    // outside the mobile-tyre-fitting vertical — lets the customer list surface
    // plate(s) alongside each customer without an extra round-trip.
    let q = adminSupabase
      .from('customers')
      .select('*, vehicles(registration_number)', { count: 'exact' })
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (search) {
      const term = `%${escapeIlike(search)}%`
      const orClauses = [
        `first_name.ilike.${term}`, `last_name.ilike.${term}`,
        `phone.ilike.${term}`, `email.ilike.${term}`, `business_name.ilike.${term}`,
      ]

      // Also match customers by their vehicle's registration plate (tyre-fitting
      // vertical) — a customer can be found by name or by number plate.
      const { data: plateMatches } = await adminSupabase
        .from('vehicles')
        .select('customer_id')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .ilike('registration_number', `%${escapeIlike(normalizePlate(search))}%`)
      const vehicleCustomerIds = [...new Set((plateMatches ?? []).map((v: { customer_id: string }) => v.customer_id))]
      if (vehicleCustomerIds.length > 0) {
        orClauses.push(`id.in.(${vehicleCustomerIds.join(',')})`)
      }

      q = q.or(orClauses.join(','))
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
    const [customerRes, repairsRes, salesRes, invoicesRes, vehiclesRes] = await Promise.all([
      adminSupabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .eq('business_id', businessId)
        .single(),
      adminSupabase
        .from('repairs')
        .select('id, job_number, status, device_brand, device_model, vehicle_id, tyre_size, tyre_quantity, created_at, actual_cost, estimated_cost, discount_amount')
        .eq('customer_id', id)
        .order('created_at', { ascending: false })
        .limit(50),
      (adminSupabase as any)
        .from('sales')
        .select('id, sale_number, total, payment_method, payment_status, amount_paid, created_at, is_refund')
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
      adminSupabase
        .from('vehicles')
        .select('*')
        .eq('customer_id', id)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
    ])

    if (customerRes.error) throw customerRes.error

    const totalSpend = (salesRes.data ?? []).reduce((s: number, r: { total: number | null }) => s + (r.total ?? 0), 0)

    return {
      ...customerRes.data,
      repairs: repairsRes.data ?? [],
      sales: salesRes.data ?? [],
      invoices: invoicesRes.data ?? [],
      vehicles: vehiclesRes.data ?? [],
      stats: {
        repair_count: (repairsRes.data ?? []).length,
        sale_count: (salesRes.data ?? []).length,
        invoice_count: (invoicesRes.data ?? []).length,
        total_spend: totalSpend,
      },
    }
  },

  async create(payload: InsertTables<'customers'>) {
    if (payload.email) {
      const { data: existing } = await adminSupabase
        .from('customers')
        .select('id')
        .eq('business_id', payload.business_id)
        .eq('email', payload.email.toLowerCase().trim())
        .maybeSingle()
      if (existing) throw new Error('A customer with this email address already exists.')
    }
    const patch = payload.phone ? { ...payload, phone: normalizePhone(payload.phone) } : payload
    const { data, error } = await adminSupabase.from('customers').insert(patch).select().single()
    if (error) throw error
    return data
  },

  async update(id: string, businessId: string, payload: UpdateTables<'customers'>) {
    if (payload.email) {
      const { data: existing } = await adminSupabase
        .from('customers')
        .select('id')
        .eq('business_id', businessId)
        .eq('email', (payload.email as string).toLowerCase().trim())
        .neq('id', id)
        .maybeSingle()
      if (existing) throw new Error('A customer with this email address already exists.')
    }
    const patch = payload.phone ? { ...payload, phone: normalizePhone(payload.phone as string) } : payload
    const { data, error } = await adminSupabase
      .from('customers')
      .update(patch)
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async remove(id: string, businessId: string) {
    const { error } = await adminSupabase
      .from('customers')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)
    if (error) throw error
  },
}
