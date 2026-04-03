import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables, UpdateTables } from '@/types/database'

export const CustomerGroupService = {
  async list(businessId: string) {
    const { data, error } = await adminSupabase
      .from('customer_groups')
      .select('*')
      .eq('business_id', businessId)
      .order('name', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async create(payload: InsertTables<'customer_groups'>) {
    const { data, error } = await adminSupabase
      .from('customer_groups')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, businessId: string, payload: UpdateTables<'customer_groups'>) {
    const { data, error } = await adminSupabase
      .from('customer_groups')
      .update(payload)
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async remove(id: string, businessId: string) {
    // Unlink customers before deleting group
    await adminSupabase
      .from('customers')
      .update({ group_id: null })
      .eq('group_id', id)
      .eq('business_id', businessId)

    const { error } = await adminSupabase
      .from('customer_groups')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)
    if (error) throw error
  },
}
