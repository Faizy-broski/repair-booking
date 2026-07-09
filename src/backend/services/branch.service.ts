import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables, UpdateTables } from '@/types/database'

export const BranchService = {
  async listByBusiness(businessId: string) {
    const { data, error } = await adminSupabase
      .from('branches')
      .select('*, profiles(id, full_name, email, role, avatar_url, is_active)')
      .eq('business_id', businessId)
      .order('is_main', { ascending: false })
      .order('name')
    if (error) throw error
    return data
  },

  async getById(id: string) {
    const { data, error } = await adminSupabase
      .from('branches')
      .select('*')
      .eq('id', id)
      .single()
    if (error) return null
    return data
  },

  async create(payload: InsertTables<'branches'>) {
    const { data, error } = await adminSupabase
      .from('branches')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, payload: UpdateTables<'branches'>) {
    const { data, error } = await adminSupabase
      .from('branches')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  /** Hard delete — only used to roll back a branch created moments earlier in the
   * same request when the follow-up step (e.g. creating its user) fails. */
  async remove(id: string) {
    const { error } = await adminSupabase.from('branches').delete().eq('id', id)
    if (error) throw error
  },
}
