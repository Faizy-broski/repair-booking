import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables, UpdateTables, Json } from '@/types/database'

export const CustomFieldService = {
  async list(businessId: string, module?: string) {
    let q = adminSupabase
      .from('custom_field_definitions')
      .select('*')
      .eq('business_id', businessId)
      .order('sort_order')

    if (module) q = q.eq('module', module)

    const { data, error } = await q
    if (error) throw error
    return data
  },

  async create(payload: InsertTables<'custom_field_definitions'>) {
    const { data, error } = await adminSupabase
      .from('custom_field_definitions')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, businessId: string, payload: Partial<UpdateTables<'custom_field_definitions'>>) {
    const { data, error } = await adminSupabase
      .from('custom_field_definitions')
      .update(payload)
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async delete(id: string, businessId: string) {
    const { error } = await adminSupabase
      .from('custom_field_definitions')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)
    if (error) throw error
  },

  async reorder(businessId: string, orderedIds: string[]) {
    const updates = orderedIds.map((id, index) =>
      adminSupabase
        .from('custom_field_definitions')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('business_id', businessId)
    )
    await Promise.all(updates)
  },
}
