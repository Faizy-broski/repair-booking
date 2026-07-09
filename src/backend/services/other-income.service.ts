import { adminSupabase } from '@/backend/config/supabase'

// other_income / other_income_categories are newer than the last generated
// database.types.ts snapshot — query via an `any`-cast client (same
// workaround used elsewhere in this codebase for tables ahead of codegen)
// instead of the strict typed generics, but still check/throw on every
// { data, error } result so failures surface as real errors.
const db = (table: string): any => (adminSupabase as any).from(table)

export interface OtherIncomeInsert {
  branch_id: string
  category_id?: string | null
  title: string
  amount: number
  income_date: string
  notes?: string | null
  created_by?: string | null
}

export const OtherIncomeService = {
  async list(branchId: string, params: { page?: number; limit?: number; from?: string; to?: string }) {
    const { page = 1, limit = 20, from, to } = params
    let q = db('other_income')
      .select('*, other_income_categories(name)', { count: 'exact' })
      .eq('branch_id', branchId)
      .order('income_date', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (from) q = q.gte('income_date', from)
    if (to) q = q.lte('income_date', to)

    const { data, error, count } = await q
    if (error) throw error
    return { data, count }
  },

  async create(payload: OtherIncomeInsert) {
    const { data, error } = await db('other_income').insert(payload).select().single()
    if (error) throw error
    return data
  },

  async update(id: string, businessId: string, payload: { title?: string; amount?: number; income_date?: string; category_id?: string | null; notes?: string | null }) {
    // Verify the income entry belongs to this business before updating —
    // fail closed if ownership can't be confirmed (unlike the falsy
    // short-circuit in the mirrored expense.service.ts check).
    const { data: existing, error: fetchErr } = await db('other_income')
      .select('id, branches!branch_id(business_id)')
      .eq('id', id)
      .single()
    if (fetchErr || !existing) throw new Error('Other income entry not found')
    const entryBusinessId = existing.branches?.business_id
    if (!entryBusinessId || entryBusinessId !== businessId) throw new Error('Forbidden')

    const { data, error } = await db('other_income')
      .update(payload)
      .eq('id', id)
      .select('*, other_income_categories(name)')
      .single()
    if (error) throw error
    return data
  },

  async delete(id: string, businessId: string) {
    const { data: existing, error: fetchErr } = await db('other_income')
      .select('id, branches!branch_id(business_id)')
      .eq('id', id)
      .single()
    if (fetchErr || !existing) throw new Error('Other income entry not found')
    const entryBusinessId = existing.branches?.business_id
    if (!entryBusinessId || entryBusinessId !== businessId) throw new Error('Forbidden')

    const { error } = await db('other_income').delete().eq('id', id)
    if (error) throw error
  },

  async getCategories(businessId: string) {
    const { data, error } = await db('other_income_categories')
      .select('id, name')
      .eq('business_id', businessId)
      .order('name')
    if (error) throw error
    return data
  },

  async createCategory(businessId: string, name: string) {
    const { data, error } = await db('other_income_categories')
      .insert({ business_id: businessId, name })
      .select()
      .single()
    if (error) throw error
    return data
  },
}
