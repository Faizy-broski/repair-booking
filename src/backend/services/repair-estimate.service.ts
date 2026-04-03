import { adminSupabase } from '@/backend/config/supabase'

export interface EstimateItem {
  name: string
  quantity: number
  unit_price: number
  total: number
}

export const RepairEstimateService = {
  async list(repairId: string) {
    const { data, error } = await adminSupabase
      .from('repair_estimates')
      .select('*')
      .eq('repair_id', repairId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async create(payload: {
    repair_id: string
    business_id: string
    branch_id: string
    customer_id: string
    items: EstimateItem[]
    total: number
    customer_note?: string | null
  }) {
    const { data, error } = await adminSupabase
      .from('repair_estimates')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async respond(id: string, status: 'approved' | 'declined' | 'changes_requested', customerNote?: string) {
    const { data, error } = await adminSupabase
      .from('repair_estimates')
      .update({
        status,
        customer_note: customerNote ?? null,
        responded_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async markSent(id: string) {
    const { data, error } = await adminSupabase
      .from('repair_estimates')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
}
