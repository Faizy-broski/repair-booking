import { adminSupabase } from '@/backend/config/supabase'
import type { UpdateTables } from '@/types/database'

export const BusinessService = {
  async list(params: { page?: number; limit?: number; search?: string }) {
    const { page = 1, limit = 20, search } = params
    let q = adminSupabase
      .from('businesses')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (search) q = q.ilike('name', `%${search}%`)

    const { data, error, count } = await q
    if (error) throw error

    // Attach subscriptions via direct query to avoid PostgREST FK-inference issues
    const businesses = data ?? []
    if (businesses.length > 0) {
      const ids = businesses.map((b: any) => b.id)
      const { data: subs } = await adminSupabase
        .from('subscriptions')
        .select('*, plans(id, name, plan_type, features, price_monthly, price_yearly)')
        .in('business_id', ids)
        .order('created_at', { ascending: false })

      const subsByBusiness: Record<string, any[]> = {}
      for (const s of subs ?? []) {
        if (!subsByBusiness[s.business_id]) subsByBusiness[s.business_id] = []
        subsByBusiness[s.business_id].push(s)
      }
      for (const biz of businesses as any[]) {
        biz.subscriptions = subsByBusiness[biz.id] ?? []
      }
    }

    return { data: businesses, count }
  },

  async getById(id: string) {
    const [{ data, error }, { data: subs }] = await Promise.all([
      adminSupabase.from('businesses').select('*, branches(*)').eq('id', id).single(),
      adminSupabase
        .from('subscriptions')
        .select('*, plans(id, name, plan_type, features, price_monthly, price_yearly)')
        .eq('business_id', id)
        .order('created_at', { ascending: false }),
    ])
    if (error) throw error
    return data ? { ...data, subscriptions: subs ?? [] } : null
  },

  async update(id: string, payload: UpdateTables<'businesses'>) {
    const { data, error } = await adminSupabase
      .from('businesses')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  /** Full eagle-eye snapshot used by the superadmin detail page. */
  async getFullDetails(id: string) {
    // Core business + subscription + branches + owner profile — all in parallel
    const [
      { data: business },
      { data: subscriptions },
      { data: ownerProfile },
      { data: branches },
    ] = await Promise.all([
      adminSupabase
        .from('businesses')
        .select('*')
        .eq('id', id)
        .single(),
      // Direct subscription query — avoids PostgREST FK-inference silently returning []
      adminSupabase
        .from('subscriptions')
        .select('*, plans(id, name, plan_type, features, price_monthly, price_yearly)')
        .eq('business_id', id)
        .order('created_at', { ascending: false }),
      adminSupabase
        .from('profiles')
        .select('id, full_name, email, phone, avatar_url, created_at, role')
        .eq('business_id', id)
        .eq('role', 'business_owner')
        .maybeSingle(),
      adminSupabase
        .from('branches')
        .select('id, name, is_main, is_active, address, phone')
        .eq('business_id', id)
        .order('is_main', { ascending: false }),
    ])

    // Per-branch stats — repairs, products, customers, staff, revenue
    const branchIds = (branches ?? []).map((b: any) => b.id)
    let totalRevenue = 0
    const branchRevenueMap:   Record<string, number> = {}
    const branchRepairMap:    Record<string, number> = {}
    const branchProductMap:   Record<string, number> = {}
    const branchCustomerMap:  Record<string, number> = {}
    const branchStaffMap:     Record<string, number> = {}

    if (branchIds.length > 0) {
      const [
        { data: salesData },
        { data: repairsData },
        { data: branchProductsData },
        { data: customersData },
        { data: staffData },
      ] = await Promise.all([
        adminSupabase.from('sales').select('branch_id, total').in('branch_id', branchIds),
        adminSupabase.from('repairs').select('branch_id').in('branch_id', branchIds),
        adminSupabase.from('branch_products').select('branch_id, products!inner(id)').in('branch_id', branchIds).eq('is_enabled', true).eq('products.is_active', true),
        adminSupabase.from('customers').select('branch_id').in('branch_id', branchIds),
        adminSupabase.from('profiles').select('branch_id').in('branch_id', branchIds).neq('role', 'business_owner'),
      ])

      for (const s of salesData ?? []) {
        const rev = s.total ?? 0
        totalRevenue += rev
        branchRevenueMap[s.branch_id] = (branchRevenueMap[s.branch_id] ?? 0) + rev
      }
      for (const r of repairsData ?? [])        branchRepairMap[r.branch_id]    = (branchRepairMap[r.branch_id]    ?? 0) + 1
      for (const p of branchProductsData ?? []) branchProductMap[p.branch_id]   = (branchProductMap[p.branch_id]   ?? 0) + 1
      for (const c of customersData ?? []) {
        if (c.branch_id) branchCustomerMap[c.branch_id] = (branchCustomerMap[c.branch_id] ?? 0) + 1
      }
      for (const s of staffData ?? []) {
        if (s.branch_id) branchStaffMap[s.branch_id] = (branchStaffMap[s.branch_id] ?? 0) + 1
      }
    }

    const branchesWithStats = (branches ?? []).map((b: any) => ({
      ...b,
      stats: {
        repairs:   branchRepairMap[b.id]   ?? 0,
        products:  branchProductMap[b.id]  ?? 0,
        customers: branchCustomerMap[b.id] ?? 0,
        staff:     branchStaffMap[b.id]    ?? 0,
        revenue:   branchRevenueMap[b.id]  ?? 0,
      },
    }))

    // Top-level stats = sum across all branches (consistent with per-branch cards below)
    const sumRepairs   = Object.values(branchRepairMap).reduce((s, v) => s + v, 0)
    const sumProducts  = Object.values(branchProductMap).reduce((s, v) => s + v, 0)
    const sumCustomers = Object.values(branchCustomerMap).reduce((s, v) => s + v, 0)
    const sumStaff     = Object.values(branchStaffMap).reduce((s, v) => s + v, 0)

    return {
      business: business ? { ...business, subscriptions: subscriptions ?? [] } : null,
      ownerProfile,
      branches: branchesWithStats,
      stats: {
        repairs:   sumRepairs,
        products:  sumProducts,
        customers: sumCustomers,
        employees: sumStaff,
        revenue:   totalRevenue,
      },
    }
  },

  /** Sends a password-reset link for the business owner via Supabase Auth admin API.
   *  Returns the action link so the superadmin can copy it if email is not configured. */
  async resetOwnerPassword(businessId: string) {
    const { data: owner } = await adminSupabase
      .from('profiles')
      .select('id, email')
      .eq('business_id', businessId)
      .eq('role', 'business_owner')
      .maybeSingle()

    if (!owner?.email) throw new Error('Owner email not found')

    const { data, error } = await adminSupabase.auth.admin.generateLink({
      type: 'recovery',
      email: owner.email,
    })
    if (error) throw error

    return {
      email: owner.email,
      // Return the link so the admin can copy it or send it manually
      actionLink: (data as any)?.properties?.action_link ?? null,
    }
  },

  async getStats() {
    const [{ count: total }, { count: active }, { count: suspended }] = await Promise.all([
      adminSupabase.from('businesses').select('*', { count: 'exact', head: true }),
      adminSupabase.from('businesses').select('*', { count: 'exact', head: true }).eq('is_active', true),
      adminSupabase.from('businesses').select('*', { count: 'exact', head: true }).eq('is_suspended', true),
    ])
    return { total: total ?? 0, active: active ?? 0, suspended: suspended ?? 0 }
  },
}
