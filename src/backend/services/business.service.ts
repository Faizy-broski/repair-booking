import { adminSupabase } from '@/backend/config/supabase'
import type { UpdateTables } from '@/types/database'

export const BusinessService = {
  async list(params: { page?: number; limit?: number; search?: string }) {
    const { page = 1, limit = 20, search } = params
    let q = adminSupabase
      .from('businesses')
      .select('id, name, subdomain, email, is_active, is_suspended, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (search) q = q.ilike('name', `%${search}%`)

    const { data, error, count } = await q
    if (error) throw error

    const businesses = data ?? []
    if (businesses.length === 0) return { data: businesses, count }

    const ids = businesses.map((b: any) => b.id)

    // Subscriptions + branches + owner profiles — all in parallel
    const [{ data: subs }, { data: branches }, { data: owners }] = await Promise.all([
      adminSupabase
        .from('subscriptions')
        .select('*, plans(id, name, plan_type, features, price_monthly, price_yearly)')
        .in('business_id', ids)
        .order('created_at', { ascending: false }),
      adminSupabase
        .from('branches')
        .select('id, business_id')
        .in('business_id', ids),
      adminSupabase
        .from('profiles')
        .select('business_id, full_name')
        .in('business_id', ids)
        .eq('role', 'business_owner')
        .limit(ids.length),
    ])

    // Map subscriptions to businesses
    const subsByBusiness: Record<string, any[]> = {}
    for (const s of subs ?? []) {
      if (!subsByBusiness[s.business_id]) subsByBusiness[s.business_id] = []
      subsByBusiness[s.business_id].push(s)
    }

    // Map branches to businesses
    const branchToBusinessMap: Record<string, string> = {}
    for (const b of branches ?? []) {
      branchToBusinessMap[b.id] = b.business_id
    }
    const allBranchIds = (branches ?? []).map((b: any) => b.id)

    // Per-business stats
    const statsMap: Record<string, { salesRevenue: number; repairRevenue: number; repairs: number; inventory: number; customers: number }> = {}
    const initStat = () => ({ salesRevenue: 0, repairRevenue: 0, repairs: 0, inventory: 0, customers: 0 })

    if (allBranchIds.length > 0) {
      const [
        { data: salesData },
        { data: repairsData },
        { data: productsData },
        { data: customersData },
      ] = await Promise.all([
        (adminSupabase as any).from('sales').select('branch_id, total, is_refund').in('branch_id', allBranchIds),
        adminSupabase.from('repairs').select('branch_id, actual_cost').in('branch_id', allBranchIds),
        (adminSupabase as any).from('branch_products').select('branch_id').in('branch_id', allBranchIds).eq('is_enabled', true),
        adminSupabase.from('customers').select('branch_id').in('branch_id', allBranchIds),
      ])

      for (const s of salesData ?? []) {
        const bizId = branchToBusinessMap[s.branch_id]; if (!bizId) continue
        if (!statsMap[bizId]) statsMap[bizId] = initStat()
        // Refund rows store a POSITIVE total with is_refund=true as the flag
        // (migration 188) — sign by is_refund to net them out of revenue.
        statsMap[bizId].salesRevenue += (s as any).is_refund ? -(s.total ?? 0) : (s.total ?? 0)
      }
      for (const r of repairsData ?? []) {
        const bizId = branchToBusinessMap[r.branch_id]; if (!bizId) continue
        if (!statsMap[bizId]) statsMap[bizId] = initStat()
        statsMap[bizId].repairs++
        statsMap[bizId].repairRevenue += r.actual_cost ?? 0
      }
      for (const p of productsData ?? []) {
        const bizId = branchToBusinessMap[p.branch_id]; if (!bizId) continue
        if (!statsMap[bizId]) statsMap[bizId] = initStat()
        statsMap[bizId].inventory++
      }
      for (const c of customersData ?? []) {
        if (!c.branch_id) continue
        const bizId = branchToBusinessMap[c.branch_id]; if (!bizId) continue
        if (!statsMap[bizId]) statsMap[bizId] = initStat()
        statsMap[bizId].customers++
      }
    }

    // Build a quick owner name lookup: business_id → full_name
    const ownerNameByBusiness: Record<string, string | null> = {}
    for (const o of owners ?? []) {
      if (o.business_id && !ownerNameByBusiness[o.business_id]) {
        ownerNameByBusiness[o.business_id] = o.full_name ?? null
      }
    }

    for (const biz of businesses as any[]) {
      biz.subscriptions = subsByBusiness[biz.id] ?? []
      biz.stats = statsMap[biz.id] ?? initStat()
      biz.owner_name = ownerNameByBusiness[biz.id] ?? null
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
    const branchRevenueMap: Record<string, number> = {}
    const branchRepairMap: Record<string, number> = {}
    const branchProductMap: Record<string, number> = {}
    const branchCustomerMap: Record<string, number> = {}
    const branchStaffMap: Record<string, number> = {}

    if (branchIds.length > 0) {
      const [
        { data: salesData },
        { data: repairsData },
        { data: branchProductsData },
        { data: customersData },
        { data: staffData },
      ] = await Promise.all([
        (adminSupabase as any).from('sales').select('branch_id, total, is_refund').in('branch_id', branchIds),
        adminSupabase.from('repairs').select('branch_id').in('branch_id', branchIds),
        (adminSupabase as any).from('branch_products').select('branch_id, products!inner(id)').in('branch_id', branchIds).eq('is_enabled', true).eq('products.is_active', true),
        adminSupabase.from('customers').select('branch_id').in('branch_id', branchIds),
        adminSupabase.from('profiles').select('branch_id').in('branch_id', branchIds).neq('role', 'business_owner'),
      ])

      for (const s of salesData ?? []) {
        // Refund rows store a POSITIVE total with is_refund=true as the flag
        // (migration 188) — sign by is_refund to net them out of revenue.
        const rev = (s as any).is_refund ? -(s.total ?? 0) : (s.total ?? 0)
        totalRevenue += rev
        branchRevenueMap[s.branch_id] = (branchRevenueMap[s.branch_id] ?? 0) + rev
      }
      for (const r of repairsData ?? []) branchRepairMap[r.branch_id] = (branchRepairMap[r.branch_id] ?? 0) + 1
      for (const p of branchProductsData ?? []) branchProductMap[p.branch_id] = (branchProductMap[p.branch_id] ?? 0) + 1
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
        repairs: branchRepairMap[b.id] ?? 0,
        products: branchProductMap[b.id] ?? 0,
        customers: branchCustomerMap[b.id] ?? 0,
        staff: branchStaffMap[b.id] ?? 0,
        revenue: branchRevenueMap[b.id] ?? 0,
      },
    }))

    // Top-level stats = sum across all branches (consistent with per-branch cards below)
    const sumRepairs = Object.values(branchRepairMap).reduce((s, v) => s + v, 0)
    const sumProducts = Object.values(branchProductMap).reduce((s, v) => s + v, 0)
    const sumCustomers = Object.values(branchCustomerMap).reduce((s, v) => s + v, 0)
    const sumStaff = Object.values(branchStaffMap).reduce((s, v) => s + v, 0)

    return {
      business: business ? { ...business, subscriptions: subscriptions ?? [] } : null,
      ownerProfile,
      branches: branchesWithStats,
      stats: {
        repairs: sumRepairs,
        products: sumProducts,
        customers: sumCustomers,
        employees: sumStaff,
        revenue: totalRevenue,
      },
    }
  },

  /** Creates (or repairs) the Supabase auth user for a business owner who was inserted
   *  directly via SQL and therefore has no auth.users entry.
   *  - If no auth user exists for the email: creates one with a generated temp password.
   *  - Fixes the profiles row so its id matches the real auth UUID.
   *  Returns the temp password so the superadmin can share it. */
  async fixAuthUser(businessId: string) {
    const { data: business } = await adminSupabase
      .from('businesses')
      .select('id, email, name')
      .eq('id', businessId)
      .single()

    if (!business?.email) throw new Error('Business email not found')

    const { data: existingProfile } = await adminSupabase
      .from('profiles')
      .select('id, full_name, email, branch_id')
      .eq('business_id', businessId)
      .eq('role', 'business_owner')
      .maybeSingle()

    // Generate a secure 16-char temp password
    const tempPassword =
      Math.random().toString(36).slice(2, 10) +
      Math.random().toString(36).slice(2, 10).toUpperCase() +
      '!1'

    let authUserId: string

    // Check if the profile UUID already maps to a real auth user
    if (existingProfile?.id) {
      const { error: notFound } = await adminSupabase.auth.admin.getUserById(existingProfile.id)
      if (!notFound) {
        // Auth user already exists with the same UUID — just reset the password
        await adminSupabase.auth.admin.updateUserById(existingProfile.id, {
          password: tempPassword,
          email_confirm: true,
        })
        return { email: business.email, tempPassword, fixed: false }
      }
    }

    // No auth user — create one
    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      email: business.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: existingProfile?.full_name ?? (business as any).name,
        role: 'business_owner',
      },
    })

    if (authError) {
      // Edge case: email already in auth.users under a different UUID (e.g. prior partial setup)
      if (authError.message?.toLowerCase().includes('already') || (authError as any).code === 'email_exists') {
        // Fall back to password reset link
        const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
          type: 'recovery',
          email: business.email,
        })
        if (linkError) throw linkError
        return {
          email: business.email,
          tempPassword: null,
          actionLink: (linkData as any)?.properties?.action_link ?? null,
          fixed: false,
        }
      }
      throw authError
    }

    authUserId = authData.user.id

    // Fix the profile: delete the stale row (wrong UUID) then upsert with real UUID
    if (existingProfile && existingProfile.id !== authUserId) {
      await adminSupabase.from('profiles').delete().eq('id', existingProfile.id)
    }

    await adminSupabase.from('profiles').upsert({
      id: authUserId,
      business_id: businessId,
      branch_id: (existingProfile as any)?.branch_id ?? null,
      role: 'business_owner',
      full_name: (existingProfile as any)?.full_name ?? (business as any).name,
      email: business.email,
      is_active: true,
    })

    return { email: business.email, tempPassword, fixed: true }
  },

  async createImpersonationSession(businessId: string, superadminId: string, ip: string | null) {
    const { data: business } = await adminSupabase
      .from('businesses')
      .select('subdomain')
      .eq('id', businessId)
      .single()
    if (!business) throw new Error('Business not found')

    const { data: owner } = await adminSupabase
      .from('profiles')
      .select('id, role, branch_id')
      .eq('business_id', businessId)
      .eq('role', 'business_owner')
      .maybeSingle()
    if (!owner) throw new Error('Business owner not found')

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes

    const { data: session, error } = await adminSupabase
      .from('impersonation_sessions' as any)
      .insert({
        business_id: businessId,
        target_user_id: owner.id,
        created_by: superadminId,
        expires_at: expiresAt.toISOString(),
        ip_address: ip,
      })
      .select('id')
      .single()
    if (error) throw error

    return { token: (session as any).id as string, subdomain: business.subdomain, targetUserId: owner.id }
  },

  async listUsers(businessId: string) {
    const { data, error } = await adminSupabase
      .from('profiles')
      .select('id, full_name, email, role, is_active, branches(id, name)')
      .eq('business_id', businessId)
      .order('role', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async resetUserPassword(businessId: string, newPassword: string, userId?: string) {
    let targetId: string
    let targetEmail: string | null

    if (userId) {
      const { data: profile } = await adminSupabase
        .from('profiles')
        .select('id, email')
        .eq('id', userId)
        .eq('business_id', businessId)
        .maybeSingle()
      if (!profile?.id) throw new Error('User not found in this business')
      targetId = profile.id
      targetEmail = profile.email
    } else {
      const { data: owner } = await adminSupabase
        .from('profiles')
        .select('id, email')
        .eq('business_id', businessId)
        .eq('role', 'business_owner')
        .maybeSingle()
      if (!owner?.id) throw new Error('Owner not found')
      targetId = owner.id
      targetEmail = owner.email
    }

    const { error } = await adminSupabase.auth.admin.updateUserById(targetId, { password: newPassword })
    if (error) throw error

    return { email: targetEmail }
  },

  async getStats() {
    const [{ count: total }, { count: active }, { count: suspended }] = await Promise.all([
      adminSupabase.from('businesses').select('*', { count: 'exact', head: true }),
      adminSupabase.from('businesses').select('*', { count: 'exact', head: true }).eq('is_active', true),
      adminSupabase.from('businesses').select('*', { count: 'exact', head: true }).eq('is_suspended', true),
    ])
    return { total: total ?? 0, active: active ?? 0, suspended: suspended ?? 0 }
  },

  async delete(id: string) {
    // 1. Collect auth user IDs + business email before deleting rows
    const { data: profiles } = await adminSupabase
      .from('profiles')
      .select('id')
      .eq('business_id', id)
    const authUserIds = (profiles ?? []).map((p: { id: string }) => p.id)

    const { data: biz } = await (adminSupabase as any)
      .from('businesses')
      .select('email')
      .eq('id', id)
      .single()
    const businessEmail: string | null = biz?.email ?? null

    // 2. Delete the business row — DB-level CASCADE removes branches, profiles,
    //    subscriptions, and all other child rows automatically.
    const { error } = await adminSupabase
      .from('businesses')
      .delete()
      .eq('id', id)
    if (error) throw error

    // 3. Clean up pending_registrations for this email so the address can be reused
    if (businessEmail) {
      await (adminSupabase as any)
        .from('pending_registrations')
        .delete()
        .eq('email', businessEmail.toLowerCase())
    }

    // 4. Remove the auth identities. Log failures but don't throw — a missing
    //    auth record doesn't need to block the DB deletion. The register flow
    //    handles orphaned auth users defensively on next signup attempt.
    const results = await Promise.allSettled(
      authUserIds.map((uid: string) => adminSupabase.auth.admin.deleteUser(uid))
    )
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[BusinessService.delete] Failed to delete auth user ${authUserIds[i]}:`, r.reason)
      }
    })
  },
}
