import { adminSupabase } from '@/backend/config/supabase'

export interface HelpdeskTicket {
  id: string
  ticket_number: number
  business_id: string
  branch_id: string | null
  created_by: string | null
  title: string
  description: string | null
  category: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  assigned_to: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  profiles?: { full_name: string | null } | null
  branches?: { name: string } | null
}

export interface CreateTicketPayload {
  business_id: string
  branch_id?: string | null
  created_by?: string | null
  title: string
  description?: string | null
  category: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
}

export interface UpdateTicketPayload {
  title?: string
  description?: string | null
  category?: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  status?: 'open' | 'in_progress' | 'resolved' | 'closed'
  resolved_at?: string | null
}

export const HelpdeskService = {
  async list(businessId: string, params: { page?: number; limit?: number; status?: string; search?: string }) {
    const { page = 1, limit = 20, status, search } = params
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = adminSupabase
      .from('helpdesk_tickets')
      .select('*, profiles!created_by(full_name), branches(name)', { count: 'exact' })
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }
    if (search) {
      query = query.ilike('title', `%${search}%`)
    }

    const { data, error, count } = await query
    if (error) throw error
    return { data: data as HelpdeskTicket[], count: count ?? 0 }
  },

  async getById(id: string, businessId: string) {
    const { data, error } = await adminSupabase
      .from('helpdesk_tickets')
      .select('*, profiles!created_by(full_name), branches(name)')
      .eq('id', id)
      .eq('business_id', businessId)
      .single()
    if (error) throw error
    return data as HelpdeskTicket
  },

  async create(payload: CreateTicketPayload) {
    const { data, error } = await adminSupabase
      .from('helpdesk_tickets')
      .insert(payload)
      .select('*, profiles!created_by(full_name), branches(name)')
      .single()
    if (error) throw error
    return data as HelpdeskTicket
  },

  async update(id: string, businessId: string, payload: UpdateTicketPayload) {
    if (payload.status === 'resolved' && !payload.resolved_at) {
      payload.resolved_at = new Date().toISOString()
    }
    const { data, error } = await adminSupabase
      .from('helpdesk_tickets')
      .update(payload)
      .eq('id', id)
      .eq('business_id', businessId)
      .select('*, profiles!created_by(full_name), branches(name)')
      .single()
    if (error) throw error
    return data as HelpdeskTicket
  },

  async delete(id: string, businessId: string) {
    const { error } = await adminSupabase
      .from('helpdesk_tickets')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)
    if (error) throw error
  },

  /* ── Super-admin methods (no business_id filter) ─────────────── */

  async listAll(params: { page?: number; limit?: number; status?: string; search?: string; businessId?: string }) {
    const { page = 1, limit = 20, status, search, businessId } = params
    const from = (page - 1) * limit
    const to   = from + limit - 1

    let query = adminSupabase
      .from('helpdesk_tickets')
      .select('*, profiles!created_by(full_name), branches(name), businesses(name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (businessId) query = query.eq('business_id', businessId)
    if (status && status !== 'all') query = query.eq('status', status)
    if (search) query = query.ilike('title', `%${search}%`)

    const { data, error, count } = await query
    if (error) throw error
    return { data: data as any[], count: count ?? 0 }
  },

  async getByIdAdmin(id: string) {
    const { data, error } = await adminSupabase
      .from('helpdesk_tickets')
      .select('*, profiles!created_by(full_name), branches(name), businesses(name)')
      .eq('id', id)
      .single()
    if (error) throw error
    return data as any
  },

  async updateAdmin(id: string, payload: UpdateTicketPayload) {
    if (payload.status === 'resolved' && !payload.resolved_at) {
      payload.resolved_at = new Date().toISOString()
    }
    const { data, error } = await adminSupabase
      .from('helpdesk_tickets')
      .update(payload)
      .eq('id', id)
      .select('*, profiles!created_by(full_name), branches(name), businesses(name)')
      .single()
    if (error) throw error
    return data as any
  },

  async deleteAdmin(id: string) {
    const { error } = await adminSupabase
      .from('helpdesk_tickets')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  async getOpenCount() {
    const { count } = await adminSupabase
      .from('helpdesk_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open')
    return count ?? 0
  },
}
