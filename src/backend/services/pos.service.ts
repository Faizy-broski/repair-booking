import { adminSupabase } from '@/backend/config/supabase'
import type { Json } from '@/types/database'

export interface PaymentSplit {
  method: 'cash' | 'card' | 'gift_card'
  amount: number
}

export interface SalePayload {
  branch_id: string
  cashier_id: string
  customer_id?: string | null
  subtotal: number
  discount: number
  tax: number
  total: number
  payment_method: string
  payment_splits?: PaymentSplit[]
  gift_card_id?: string | null
  gift_card_amount?: number
  notes?: string | null
  items: {
    product_id?: string | null
    variant_id?: string | null
    name: string
    quantity: number
    unit_price: number
    discount: number
    total: number
    is_service?: boolean
  }[]
}

export const PosService = {
  async processSale(payload: SalePayload): Promise<string> {
    const { data, error } = await adminSupabase.rpc('process_sale', {
      p_sale_data: payload as unknown as Json,
    })
    if (error) throw error
    return data as string
  },

  async getSales(branchId: string, params: { page?: number; limit?: number; from?: string; to?: string }) {
    const { page = 1, limit = 20, from, to } = params
    let q = adminSupabase
      .from('sales')
      .select('*, customers(first_name,last_name), profiles!cashier_id(full_name)', { count: 'exact' })
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (from) q = q.gte('created_at', from)
    if (to) q = q.lte('created_at', to)

    const { data, error, count } = await q
    if (error) throw error
    return { data, count }
  },

  async getSaleById(id: string, branchId: string) {
    const { data, error } = await adminSupabase
      .from('sales')
      .select('*, sale_items(*), customers(*)')
      .eq('id', id)
      .eq('branch_id', branchId)
      .single()
    if (error) throw error
    return data
  },

  async processRefund(payload: {
    original_sale_id: string
    branch_id: string
    cashier_id: string
    customer_id?: string | null
    subtotal: number
    tax: number
    total: number
    payment_method: string
    refund_reason?: string | null
    items: {
      product_id?: string | null
      variant_id?: string | null
      name: string
      quantity: number
      unit_price: number
      total: number
      is_service?: boolean
    }[]
  }): Promise<string> {
    const { data, error } = await adminSupabase.rpc('process_refund', {
      p_refund_data: payload as unknown as import('@/types/database').Json,
    })
    if (error) throw error
    return data as string
  },
}
