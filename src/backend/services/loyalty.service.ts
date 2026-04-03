import { adminSupabase } from '@/backend/config/supabase'

export const LoyaltyService = {
  async getSettings(businessId: string) {
    const { data } = await adminSupabase
      .from('loyalty_settings')
      .select('*')
      .eq('business_id', businessId)
      .maybeSingle()
    return data
  },

  async upsertSettings(businessId: string, payload: {
    earn_rate?: number; redeem_rate?: number; min_redeem_points?: number; is_enabled?: boolean
  }) {
    const { data, error } = await adminSupabase
      .from('loyalty_settings')
      .upsert({ business_id: businessId, ...payload, updated_at: new Date().toISOString() }, { onConflict: 'business_id' })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getBalance(businessId: string, customerId: string): Promise<number> {
    const { data } = await adminSupabase
      .from('loyalty_points')
      .select('balance')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .maybeSingle()
    return data?.balance ?? 0
  },

  async getTransactions(businessId: string, customerId: string) {
    const { data, error } = await adminSupabase
      .from('loyalty_transactions')
      .select('*')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return data ?? []
  },

  async addPoints(businessId: string, customerId: string, points: number, type: 'earned' | 'adjusted', referenceId?: string) {
    await adminSupabase
      .from('loyalty_points')
      .upsert({ business_id: businessId, customer_id: customerId, balance: 0 }, { onConflict: 'business_id,customer_id' })

    const { data: row, error: fetchErr } = await adminSupabase
      .from('loyalty_points')
      .select('balance')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .single()
    if (fetchErr) throw fetchErr

    const newBalance = (row.balance ?? 0) + points

    await adminSupabase
      .from('loyalty_points')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('business_id', businessId)
      .eq('customer_id', customerId)

    await adminSupabase.from('loyalty_transactions').insert({
      business_id: businessId, customer_id: customerId,
      points, type, reference_id: referenceId ?? null,
    })

    return newBalance
  },

  async redeemPoints(businessId: string, customerId: string, points: number, referenceId?: string) {
    const balance = await this.getBalance(businessId, customerId)
    if (balance < points) throw new Error('Insufficient loyalty points')

    const newBalance = balance - points

    await adminSupabase
      .from('loyalty_points')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('business_id', businessId)
      .eq('customer_id', customerId)

    await adminSupabase.from('loyalty_transactions').insert({
      business_id: businessId, customer_id: customerId,
      points: -points, type: 'redeemed', reference_id: referenceId ?? null,
    })

    return newBalance
  },

  /** Calculate how many points a sale earns */
  async calculateEarnedPoints(businessId: string, totalAmount: number): Promise<number> {
    const settings = await this.getSettings(businessId)
    if (!settings?.is_enabled) return 0
    return Math.floor(totalAmount * (settings.earn_rate ?? 0.01) * 100)
  },

  /** Calculate the monetary value of N points */
  async pointsToValue(businessId: string, points: number): Promise<number> {
    const settings = await this.getSettings(businessId)
    if (!settings?.is_enabled) return 0
    return points * (settings.redeem_rate ?? 0.01)
  },
}
