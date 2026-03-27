import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables, UpdateTables } from '@/types/database'

const db = (t: string): any => (adminSupabase as any).from(t)
const rpc = (fn: string, args?: Record<string, unknown>): any => (adminSupabase as any).rpc(fn, args)

export const RepairService = {
  async list(branchId: string | undefined, params: { page?: number; limit?: number; status?: string; search?: string; businessId?: string }) {
    const { page = 1, limit = 20, status, search, businessId } = params
    let q = adminSupabase
      .from('repairs')
      .select('*, customers(first_name,last_name,phone,email), employees!assigned_to(id,first_name,last_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    // Staff: filter by their branch. Owners: filter by business via branches join
    if (branchId) {
      q = q.eq('branch_id', branchId)
    } else if (businessId) {
      // Owner sees all branches — filter via in() on branch IDs for this business
      const { data: branches } = await adminSupabase
        .from('branches')
        .select('id')
        .eq('business_id', businessId)
      const ids = (branches ?? []).map((b) => b.id)
      if (ids.length > 0) q = q.in('branch_id', ids)
    }

    if (status) q = q.eq('status', status)
    if (search) q = q.or(`job_number.ilike.%${search}%,device_model.ilike.%${search}%`)

    const { data, error, count } = await q
    if (error) throw error
    return { data, count }
  },

  async getById(id: string, branchId?: string) {
    let q = adminSupabase
      .from('repairs')
      .select('*, customers(*), repair_items(*), repair_status_history(*), employees!assigned_to(id,first_name,last_name)')
      .eq('id', id)
    // branchId is null/empty for business owners who have access to all branches
    if (branchId) q = q.eq('branch_id', branchId)
    const { data, error } = await q.single()
    if (error) throw error
    return data
  },

  async create(payload: Omit<InsertTables<'repairs'>, 'job_number'>) {
    // Auto-generate job number
    const { data: jobNum } = await rpc('generate_job_number', {
      p_branch_id: payload.branch_id,
    })

    const { data, error } = await db('repairs')
      .insert({ ...payload, job_number: jobNum })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async update(id: string, branchId: string | undefined, payload: UpdateTables<'repairs'>) {
    let q = db('repairs').update(payload).eq('id', id)
    if (branchId) q = q.eq('branch_id', branchId)
    const { data, error } = await q.select().single()
    if (error) throw error
    return data
  },

  async updateStatus(id: string, newStatus: string, note: string, changedBy: string) {
    const { error } = await rpc('update_repair_status', {
      p_repair_id: id,
      p_new_status: newStatus,
      p_note: note,
      p_changed_by: changedBy,
    })
    if (error) throw error
  },

  async getStatusHistory(repairId: string) {
    const { data, error } = await adminSupabase
      .from('repair_status_history')
      .select('*, profiles!changed_by(full_name)')
      .eq('repair_id', repairId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },
}
