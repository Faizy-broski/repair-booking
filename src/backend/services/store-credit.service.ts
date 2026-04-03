import { adminSupabase } from '@/backend/config/supabase'

const db = (table: string): any => (adminSupabase as any).from(table)

export const StoreCreditService = {
  async getBalance(businessId: string, customerId: string): Promise<number> {
    const { data } = await adminSupabase
      .from('store_credits')
      .select('balance')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .maybeSingle()
    return (data as any)?.balance ?? 0
  },

  async getTransactions(businessId: string, customerId: string) {
    const { data, error } = await adminSupabase
      .from('store_credit_transactions')
      .select('*')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return data ?? []
  },

  /** Add credit to a customer's balance */
  async credit(businessId: string, customerId: string, amount: number, opts: {
    note?: string; referenceId?: string; referenceType?: string; createdBy?: string
  } = {}) {
    // Ensure balance row exists
    await db('store_credits')
      .upsert({ business_id: businessId, customer_id: customerId, balance: 0 }, { onConflict: 'business_id,customer_id' })

    // Fetch & increment
    const { data: row, error: fetchErr } = await adminSupabase
      .from('store_credits')
      .select('balance')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .single()
    if (fetchErr) throw fetchErr

    const newBalance = ((row as any).balance ?? 0) + amount

    const { error: updateErr } = await db('store_credits')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
    if (updateErr) throw updateErr

    await db('store_credit_transactions').insert({
      business_id:   businessId,
      customer_id:   customerId,
      amount,
      type:          'credit',
      note:          opts.note ?? null,
      reference_id:  opts.referenceId ?? null,
      reference_type: opts.referenceType ?? null,
      created_by:    opts.createdBy ?? null,
    })

    return newBalance
  },

  /** Debit using the atomic DB function (prevents overdraft) */
  async debit(businessId: string, customerId: string, amount: number, opts: {
    note?: string; referenceId?: string; referenceType?: string; createdBy?: string
  } = {}) {
    const { data, error } = await (adminSupabase as any).rpc('apply_store_credit', {
      p_business_id:    businessId,
      p_customer_id:    customerId,
      p_amount:         amount,
      p_note:           opts.note ?? null,
      p_reference_id:   opts.referenceId ?? null,
      p_reference_type: opts.referenceType ?? null,
      p_created_by:     opts.createdBy ?? null,
    })
    if (error) throw error
    return data as number
  },

  /** Set balance to an arbitrary value (manager adjustment) */
  async adjust(businessId: string, customerId: string, newBalance: number, note: string, createdBy?: string) {
    const current = await this.getBalance(businessId, customerId)

    await db('store_credits')
      .upsert({ business_id: businessId, customer_id: customerId, balance: newBalance, updated_at: new Date().toISOString() }, { onConflict: 'business_id,customer_id' })

    await db('store_credit_transactions').insert({
      business_id: businessId, customer_id: customerId,
      amount: newBalance - current, type: 'adjustment', note, created_by: createdBy ?? null,
    })

    return newBalance
  },
}
