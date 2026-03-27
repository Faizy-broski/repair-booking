import { adminSupabase } from '@/backend/config/supabase'
import { randomBytes } from 'crypto'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (table: string): any => (adminSupabase as any).from(table)

export const AppointmentService = {
  async list(branchId: string, params: { from?: string; to?: string; status?: string }) {
    let q = db('appointments')
      .select('*, customers(first_name,last_name,phone,email), employees(first_name,last_name), service_problems(name,price)')
      .eq('branch_id', branchId)
      .order('start_time')

    if (params.from) q = q.gte('start_time', params.from)
    if (params.to) q = q.lte('start_time', params.to)
    if (params.status) q = q.eq('status', params.status)

    const { data, error } = await q
    if (error) throw error
    return data
  },

  async getById(id: string, branchId: string) {
    const { data, error } = await db('appointments')
      .select('*, customers(first_name,last_name,phone,email), employees(first_name,last_name), service_problems(name,price)')
      .eq('id', id)
      .eq('branch_id', branchId)
      .single()
    if (error) return null
    return data
  },

  async getByToken(token: string) {
    const { data, error } = await db('appointments')
      .select('*, service_problems(name,price)')
      .eq('booking_token', token)
      .single()
    if (error) return null
    return data
  },

  async create(payload: Record<string, unknown>) {
    const { data, error } = await db('appointments').insert(payload).select().single()
    if (error) throw error
    return data
  },

  async createPublicBooking(payload: {
    branch_id: string
    service_id?: string
    title: string
    start_time: string
    end_time: string
    customer_name: string
    customer_email: string
    customer_phone?: string
    customer_note?: string
    status: string
    booking_source: string
  }) {
    const token = randomBytes(16).toString('hex')
    const row = { ...payload, booking_token: token }
    const { data, error } = await db('appointments').insert(row).select().single()
    if (error) throw error
    return data
  },

  async update(id: string, branchId: string, payload: Record<string, unknown>) {
    const { data, error } = await db('appointments')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('branch_id', branchId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async delete(id: string, branchId: string) {
    await db('appointments').delete().eq('id', id).eq('branch_id', branchId)
  },

  async cancelByToken(token: string) {
    const { data, error } = await db('appointments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('booking_token', token)
      .neq('status', 'cancelled')
      .select()
      .single()
    if (error) return null
    return data
  },
}
