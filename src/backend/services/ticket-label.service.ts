import { adminSupabase } from '@/backend/config/supabase'

export const TicketLabelService = {
  async list(businessId: string) {
    const { data, error } = await adminSupabase
      .from('ticket_labels')
      .select('*')
      .eq('business_id', businessId)
      .order('name')
    if (error) throw error
    return data
  },

  async create(businessId: string, name: string, color: string) {
    const { data, error } = await adminSupabase
      .from('ticket_labels')
      .insert({ business_id: businessId, name, color })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, businessId: string, name: string, color: string) {
    const { data, error } = await adminSupabase
      .from('ticket_labels')
      .update({ name, color })
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async delete(id: string, businessId: string) {
    const { error } = await adminSupabase
      .from('ticket_labels')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)
    if (error) throw error
  },

  async setRepairLabels(repairId: string, labelIds: string[]) {
    const { data, error } = await adminSupabase
      .from('repairs')
      .update({ label_ids: labelIds })
      .eq('id', repairId)
      .select('id, label_ids')
      .single()
    if (error) throw error
    return data
  },
}
