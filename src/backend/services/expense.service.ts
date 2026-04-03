import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables } from '@/types/database'

export const ExpenseService = {
  async list(branchId: string, params: { page?: number; limit?: number; from?: string; to?: string }) {
    const { page = 1, limit = 20, from, to } = params
    let q = adminSupabase
      .from('expenses')
      .select('*, expense_categories(name)', { count: 'exact' })
      .eq('branch_id', branchId)
      .order('expense_date', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (from) q = q.gte('expense_date', from)
    if (to) q = q.lte('expense_date', to)

    const { data, error, count } = await q
    if (error) throw error
    return { data, count }
  },

  async listAll(businessId: string, params: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = params
    const { data, error, count } = await adminSupabase
      .from('expenses')
      .select('*, expense_categories(name), branches!branch_id(name)', { count: 'exact' })
      .in('branch_id', adminSupabase.from('branches').select('id').eq('business_id', businessId) as unknown as string[])
      .order('expense_date', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)
    if (error) throw error
    return { data, count }
  },

  async create(payload: InsertTables<'expenses'>) {
    const { data, error } = await adminSupabase.from('expenses').insert(payload).select().single()
    if (error) throw error
    return data
  },

  async delete(id: string, branchId: string) {
    const { error } = await adminSupabase
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('branch_id', branchId)
    if (error) throw error
  },

  async getSalaries(branchId: string) {
    const { data, error } = await adminSupabase
      .from('salaries')
      .select('*, employees(first_name,last_name)')
      .eq('branch_id', branchId)
      .order('pay_date', { ascending: false })
    if (error) throw error
    return data
  },

  async createSalary(payload: InsertTables<'salaries'>) {
    const { data, error } = await adminSupabase.from('salaries').insert(payload).select().single()
    if (error) throw error
    return data
  },

  async getCategories(businessId: string) {
    const { data, error } = await adminSupabase
      .from('expense_categories')
      .select('id, name')
      .eq('business_id', businessId)
      .order('name')
    if (error) throw error
    return data
  },
}
