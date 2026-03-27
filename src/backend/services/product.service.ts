import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables, UpdateTables } from '@/types/database'

export const ProductService = {
  async list(businessId: string, params: { page?: number; limit?: number; search?: string; categoryId?: string }) {
    const { page = 1, limit = 20, search, categoryId } = params
    let q = adminSupabase
      .from('products')
      .select('*, categories(name), brands(name)', { count: 'exact' })
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('name')
      .range((page - 1) * limit, page * limit - 1)

    if (search) q = q.ilike('name', `%${search}%`)
    if (categoryId) q = q.eq('category_id', categoryId)

    const { data, error, count } = await q
    if (error) throw error
    return { data, count }
  },

  async getById(id: string, businessId: string) {
    const { data, error } = await adminSupabase
      .from('products')
      .select('*, product_variants(*), categories(name), brands(name)')
      .eq('id', id)
      .eq('business_id', businessId)
      .single()
    if (error) throw error
    return data
  },

  async create(payload: InsertTables<'products'>) {
    const { data, error } = await adminSupabase.from('products').insert(payload).select().single()
    if (error) throw error
    return data
  },

  async update(id: string, businessId: string, payload: UpdateTables<'products'>) {
    const { data, error } = await adminSupabase
      .from('products')
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
      .from('products')
      .update({ is_active: false })
      .eq('id', id)
      .eq('business_id', businessId)
    if (error) throw error
  },
}
