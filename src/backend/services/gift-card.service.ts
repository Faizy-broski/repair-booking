import { adminSupabase } from '@/backend/config/supabase'
import { generateGiftCardCode } from '@/lib/utils'
import type { InsertTables } from '@/types/database'

export const GiftCardService = {
  async list(branchId: string) {
    const { data, error } = await adminSupabase
      .from('gift_cards')
      .select('*, customers(first_name,last_name)')
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async getByCode(code: string, branchId: string) {
    const { data, error } = await adminSupabase
      .from('gift_cards')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .single()
    if (error) return null
    return data
  },

  async create(branchId: string, payload: Omit<InsertTables<'gift_cards'>, 'code' | 'balance'>) {
    const code = generateGiftCardCode()
    const { data, error } = await adminSupabase
      .from('gift_cards')
      .insert({ ...payload, code, balance: payload.initial_value, branch_id: branchId })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deactivate(id: string, branchId: string) {
    await adminSupabase.from('gift_cards').update({ is_active: false }).eq('id', id).eq('branch_id', branchId)
  },
}
