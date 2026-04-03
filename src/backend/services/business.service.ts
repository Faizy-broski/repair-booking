import { adminSupabase } from '@/backend/config/supabase'
import type { UpdateTables } from '@/types/database'

export const BusinessService = {
  async list(params: { page?: number; limit?: number; search?: string }) {
    const { page = 1, limit = 20, search } = params
    let q = adminSupabase
      .from('businesses')
      .select('*, subscriptions(status,plans(name))', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (search) q = q.ilike('name', `%${search}%`)

    const { data, error, count } = await q
    if (error) throw error
    return { data, count }
  },

  async getById(id: string) {
    const { data, error } = await adminSupabase
      .from('businesses')
      .select('*, subscriptions(*, plans(*)), branches(*)')
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, payload: UpdateTables<'businesses'>) {
    const { data, error } = await adminSupabase
      .from('businesses')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getStats() {
    const [{ count: total }, { count: active }, { count: suspended }] = await Promise.all([
      adminSupabase.from('businesses').select('*', { count: 'exact', head: true }),
      adminSupabase.from('businesses').select('*', { count: 'exact', head: true }).eq('is_active', true),
      adminSupabase.from('businesses').select('*', { count: 'exact', head: true }).eq('is_suspended', true),
    ])
    return { total: total ?? 0, active: active ?? 0, suspended: suspended ?? 0 }
  },
}
