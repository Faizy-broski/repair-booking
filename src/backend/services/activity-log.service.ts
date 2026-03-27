import { adminSupabase } from '@/backend/config/supabase'

// Bypass Supabase type inference for new Phase 6 tables (see payroll.service.ts for full explanation)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (table: string): any => (adminSupabase as any).from(table)

// ── Employee Activity Log ─────────────────────────────────────────────────────

export const ActivityLogService = {
  async log(payload: {
    business_id: string
    branch_id?: string | null
    user_id: string
    module: string
    action: string
    record_id?: string | null
    table_name?: string | null
    ip_address?: string | null
    user_agent?: string | null
    metadata?: Record<string, unknown> | null
  }) {
    // Fire-and-forget — never throw so it never blocks a real request
    db('employee_activity_log').insert({
      ...payload,
      branch_id:  payload.branch_id  ?? null,
      record_id:  payload.record_id  ?? null,
      table_name: payload.table_name ?? null,
      ip_address: payload.ip_address ?? null,
      user_agent: payload.user_agent ?? null,
      metadata:   payload.metadata   ?? null,
    }).then(() => {/* intentionally ignored */})
  },

  async list(businessId: string, filters: {
    userId?: string; module?: string; action?: string
    startDate?: string; endDate?: string; page?: number; limit?: number
  }) {
    const { userId, module, action, startDate, endDate, page = 1, limit = 50 } = filters
    const from = (page - 1) * limit

    let q = db('employee_activity_log')
      .select('*, profiles!user_id(full_name)', { count: 'exact' })
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1)

    if (userId)    q = q.eq('user_id', userId)
    if (module)    q = q.eq('module', module)
    if (action)    q = q.eq('action', action)
    if (startDate) q = q.gte('created_at', `${startDate}T00:00:00Z`)
    if (endDate)   q = q.lte('created_at', `${endDate}T23:59:59Z`)

    const { data, error, count } = await q
    if (error) throw error
    return { data: data ?? [], total: count ?? 0 }
  },
}

// ── IP Whitelist ──────────────────────────────────────────────────────────────

export const IpWhitelistService = {
  async list(businessId: string, profileId: string) {
    const { data, error } = await db('employee_ip_whitelist')
      .select('*')
      .eq('business_id', businessId)
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async listForBusiness(businessId: string) {
    const { data, error } = await db('employee_ip_whitelist')
      .select('*, profiles!profile_id(full_name)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async add(businessId: string, profileId: string, ipAddress: string, label?: string) {
    const { data, error } = await db('employee_ip_whitelist')
      .upsert(
        { business_id: businessId, profile_id: profileId, ip_address: ipAddress, label: label ?? null },
        { onConflict: 'business_id,profile_id,ip_address' }
      )
      .select()
      .single()
    if (error) throw error
    return data
  },

  async remove(id: string, businessId: string) {
    const { error } = await db('employee_ip_whitelist')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)
    if (error) throw error
  },

  /** Returns true if this user's IP is allowed (whitelist empty = allow all) */
  async isAllowed(businessId: string, profileId: string, ipAddress: string): Promise<boolean> {
    const { data } = await db('employee_ip_whitelist')
      .select('id')
      .eq('business_id', businessId)
      .eq('profile_id', profileId)

    if (!data || data.length === 0) return true  // no whitelist = all IPs allowed

    // Check if this IP is in the whitelist
    const { data: match } = await db('employee_ip_whitelist')
      .select('id')
      .eq('business_id', businessId)
      .eq('profile_id', profileId)
      .eq('ip_address', ipAddress)
      .maybeSingle()
    return match !== null
  },
}
