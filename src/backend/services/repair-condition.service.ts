import { adminSupabase } from '@/backend/config/supabase'

export interface ConditionItem {
  label: string
  status: 'ok' | 'damaged' | 'missing'
  notes?: string | null
}

export const RepairConditionService = {
  async getConditions(repairId: string) {
    const { data, error } = await adminSupabase
      .from('repair_condition_items')
      .select('*')
      .eq('repair_id', repairId)
      .order('stage')
      .order('created_at')
    if (error) throw error
    return data
  },

  async saveConditions(repairId: string, stage: 'pre' | 'post', items: ConditionItem[]) {
    // Delete existing for this stage then re-insert (replace pattern)
    await adminSupabase
      .from('repair_condition_items')
      .delete()
      .eq('repair_id', repairId)
      .eq('stage', stage)

    if (items.length === 0) return []

    const rows = items.map((item) => ({
      repair_id: repairId,
      stage,
      label: item.label,
      status: item.status,
      notes: item.notes ?? null,
    }))

    const { data, error } = await adminSupabase
      .from('repair_condition_items')
      .insert(rows)
      .select()
    if (error) throw error
    return data
  },

  async getTemplates(businessId: string) {
    const { data, error } = await adminSupabase
      .from('repair_condition_templates')
      .select('*')
      .eq('business_id', businessId)
    if (error) throw error
    return data
  },
}
