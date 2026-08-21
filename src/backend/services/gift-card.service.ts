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

  // A gift card sold for cash puts real money in the till, but until now
  // nothing recorded that — the drawer's Expected Cash never reflected it,
  // producing a guaranteed "cash over" variance at close-out (see the
  // Expected Cash audit that led to this fix). Cash sales now require an
  // open register session and record a cash_movements row against it, same
  // as every other way cash enters the drawer. Card/other payments are
  // untouched since no cash needs tracking for them.
  async create(
    branchId: string,
    payload: Omit<InsertTables<'gift_cards'>, 'code' | 'balance'> & { payment_method?: 'cash' | 'card' | 'other' },
    auth: { businessId: string; cashierId: string }
  ) {
    const { payment_method = 'cash', ...cardPayload } = payload

    let sessionId: string | null = null
    if (payment_method === 'cash') {
      const { data: session } = await adminSupabase
        .from('register_sessions')
        .select('id')
        .eq('branch_id', branchId)
        .eq('status', 'open')
        .maybeSingle()
      if (!session) {
        throw new Error('Open the register before selling a gift card for cash, or choose a different payment method.')
      }
      sessionId = (session as any).id
    }

    const code = generateGiftCardCode()
    const { data, error } = await adminSupabase
      .from('gift_cards')
      .insert({ ...cardPayload, code, balance: cardPayload.initial_value, branch_id: branchId })
      .select()
      .single()
    if (error) throw error

    if (payment_method === 'cash' && sessionId) {
      const { error: cashError } = await (adminSupabase as any).rpc('record_cash_movement', {
        p_session_id: sessionId,
        p_branch_id: branchId,
        p_business_id: auth.businessId,
        p_cashier_id: auth.cashierId,
        p_type: 'cash_in',
        p_amount: cardPayload.initial_value,
        p_payment_type: 'cash',
        p_notes: `Gift card sale — ${data.code}`,
        // Dedicated purpose (not 'plain') so P&L calculations can exclude it
        // — a gift card sale is deferred revenue, not revenue (migration 187).
        p_purpose: 'gift_card_sale',
      })
      if (cashError) {
        // Don't leave a gift card whose cash was never tracked — undo the
        // issuance and surface the failure instead.
        await adminSupabase.from('gift_cards').delete().eq('id', data.id)
        throw cashError
      }
    }

    return data
  },

  async deactivate(id: string, branchId: string) {
    await adminSupabase.from('gift_cards').update({ is_active: false }).eq('id', id).eq('branch_id', branchId)
  },
}
