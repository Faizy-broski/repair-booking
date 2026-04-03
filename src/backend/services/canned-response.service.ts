import { adminSupabase } from '@/backend/config/supabase'

export const CannedResponseService = {
  async list(businessId: string, type?: string) {
    let q = adminSupabase
      .from('canned_responses')
      .select('*')
      .eq('business_id', businessId)
      .order('title', { ascending: true })

    if (type) q = q.eq('type', type)

    const { data, error } = await q
    if (error) throw error
    return data ?? []
  },

  async create(businessId: string, title: string, body: string, type: string) {
    const { data, error } = await adminSupabase
      .from('canned_responses')
      .insert({ business_id: businessId, title, body, type })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, businessId: string, payload: { title?: string; body?: string; type?: string }) {
    const { data, error } = await adminSupabase
      .from('canned_responses')
      .update(payload)
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async remove(id: string, businessId: string) {
    const { error } = await adminSupabase
      .from('canned_responses')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)
    if (error) throw error
  },
}
