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

  async list(branchId: string) {
    await this.expireCards(branchId)
    const { data, error } = await adminSupabase
      .from('gift_cards')
      .select('*, customers(first_name,last_name)')
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
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
