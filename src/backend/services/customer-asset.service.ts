import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables, UpdateTables } from '@/types/database'

export const CustomerAssetService = {
  async list(businessId: string, customerId: string) {
    const { data, error } = await adminSupabase
      .from('customer_assets')
      .select('*, repairs(id, job_number, status, created_at)')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async create(payload: InsertTables<'customer_assets'>) {
    const { data, error } = await adminSupabase
      .from('customer_assets')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, businessId: string, payload: UpdateTables<'customer_assets'>) {
    const { data, error } = await adminSupabase
      .from('customer_assets')
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
      .from('customer_assets')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)
    if (error) throw error
  },
}
