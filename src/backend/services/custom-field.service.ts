import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables, UpdateTables, Json } from '@/types/database'

export const CustomFieldService = {
  async list(businessId: string, module?: string, repairCategory?: string) {
    let q = adminSupabase
      .from('custom_field_definitions')
      .select('*')
      .eq('business_id', businessId)
      .order('sort_order')

    if (module) q = q.eq('module', module)

    // For repairs: return universal fields (null category) + category-specific fields
    // If repairCategory is provided, return fields that match OR have no category
    if (repairCategory) {
      q = q.or(`repair_category.is.null,repair_category.eq.${repairCategory}`)
    }

    const { data, error } = await q
    // If repair_category column doesn't exist yet (migration pending), fall back without it
    if (error) {
      if (error.code === '42703') {
        const { data: fallback, error: fallbackError } = await adminSupabase
          .from('custom_field_definitions')
          .select('*')
          .eq('business_id', businessId)
          .order('sort_order')
          .then(r => (module ? { ...r, data: r.data?.filter(f => (f as any).module === module) ?? null } : r))
        if (fallbackError) throw fallbackError
        return fallback
      }
      throw error
    }
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
