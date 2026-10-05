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

  async create(payload: InsertTables<'expenses'> & { include_in_pnl?: boolean | null }) {
    // include_in_pnl isn't in the generated Supabase types until migration 207 is applied and types regenerated.
    const { data, error } = await adminSupabase.from('expenses').insert(payload as any).select().single()
    if (error) throw error
    return data
  },

  async update(id: string, businessId: string, payload: { title?: string; amount?: number; expense_date?: string; category_id?: string | null; payment_method?: 'cash' | 'card'; notes?: string | null; include_in_pnl?: boolean | null }) {
    // Verify the expense belongs to this business before updating
    const { data: existing, error: fetchErr } = await adminSupabase
      .from('expenses')
      .select('id, branches!branch_id(business_id)')
      .eq('id', id)
      .single()
    if (fetchErr || !existing) throw new Error('Expense not found')
    const expBusinessId = (existing as any).branches?.business_id
    if (expBusinessId && expBusinessId !== businessId) throw new Error('Forbidden')

    const { data, error } = await adminSupabase
      .from('expenses')
      .update(payload as any)
      .eq('id', id)
      .select('*, expense_categories(name)')
      .single()
    if (error) throw error
    return data
  },

  async delete(id: string, businessId: string) {
    // Verify ownership via business before deleting
    const { data: existing, error: fetchErr } = await adminSupabase
      .from('expenses')
      .select('id, branches!branch_id(business_id)')
      .eq('id', id)
      .single()
    if (fetchErr || !existing) throw new Error('Expense not found')
    const expBusinessId = (existing as any).branches?.business_id
    if (expBusinessId && expBusinessId !== businessId) throw new Error('Forbidden')

    const { error } = await adminSupabase
      .from('expenses')
      .delete()
      .eq('id', id)
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
      .select('*')
      .eq('business_id', businessId)
      .order('name')
    if (error) throw error
    return data
  },

  async createCategory(businessId: string, name: string, includeInPnl = true) {
    const { data, error } = await adminSupabase
      .from('expense_categories')
      .insert({ business_id: businessId, name, ...(includeInPnl ? {} : { include_in_pnl: false }) } as any)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateCategory(id: string, businessId: string, payload: { name?: string; include_in_pnl?: boolean }) {
    const { data, error } = await adminSupabase
      .from('expense_categories')
      .update(payload as any)
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  /**
   * Expense amounts that count towards P&L (effective flag = expense override,
   * else category default, else included). Falls back to every expense when
   * migration 207's columns don't exist yet, so reports keep working before it
   * is applied.
   */
  async listIncludedAmounts(branchId: string, fromDate: string): Promise<{ data: { amount: number }[] }> {
    const { data, error } = await adminSupabase
      .from('expenses')
      .select('amount, include_in_pnl, expense_categories(include_in_pnl)' as any)
      .eq('branch_id', branchId)
      .gte('expense_date', fromDate)
    if (error) {
      const fallback = await adminSupabase.from('expenses').select('amount').eq('branch_id', branchId).gte('expense_date', fromDate)
      return { data: (fallback.data ?? []) as { amount: number }[] }
    }
    const rows = ((data ?? []) as any[]).filter(r => (r.include_in_pnl ?? r.expense_categories?.include_in_pnl ?? true) !== false)
    return { data: rows.map(r => ({ amount: r.amount })) }
  },
}
