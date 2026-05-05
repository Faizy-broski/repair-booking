import { adminSupabase } from '@/backend/config/supabase'
import { generateGiftCardCode } from '@/lib/utils'
import type { InsertTables } from '@/types/database'

export const GiftCardService = {
  /** Deactivate any expired gift cards for this branch before returning results */
  async expireCards(branchId: string) {
    await adminSupabase
      .from('gift_cards')
      .update({ is_active: false })
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .lt('expires_at', new Date().toISOString())
  },

  async list(branchId: string, page = 1, limit = 20) {
    await this.expireCards(branchId)
    const { data, error, count } = await adminSupabase
      .from('gift_cards')
      .select('*, customers(first_name,last_name)', { count: 'exact' })
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)
    if (error) throw error
    return { data, count }
  },

  async getByCode(code: string, branchId: string, customerId?: string | null) {
    await this.expireCards(branchId)
    const { data, error } = await adminSupabase
      .from('gift_cards')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .single()
    if (error) return null
    // If card is restricted to specific customers, validate
    const ids: string[] = data.customer_ids ?? []
    if (ids.length > 0 && customerId && !ids.includes(customerId)) {
      return null
    }
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
