import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables, UpdateTables } from '@/types/database'

export const BranchService = {
  async listByBusiness(businessId: string) {
    const { data, error } = await adminSupabase
      .from('branches')
      .select('*')
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
}
