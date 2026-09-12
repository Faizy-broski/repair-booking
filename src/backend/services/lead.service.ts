import { adminSupabase } from '@/backend/config/supabase'

export type LeadSource = 'contact_us' | 'demo_request' | 'enterprise_contact' | 'newsletter'
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'closed'

export interface Lead {
  id: string
  source: LeadSource
  name: string
  email: string
  phone: string | null
  company: string | null
  message: string | null
  page_url: string | null
  status: LeadStatus
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CreateLeadPayload {
  source: LeadSource
  name: string
  email: string
  phone?: string | null
  company?: string | null
  message?: string | null
  page_url?: string | null
  metadata?: Record<string, unknown>
}

export interface UpdateLeadPayload {
  status?: LeadStatus
  message?: string | null
}

export const LeadService = {
  async create(payload: CreateLeadPayload) {
    const { data, error } = await adminSupabase
      .from('leads')
      .insert(payload)
      .select('*')
      .single()
    if (error) throw error
    return data as Lead
  },

  async listAll(params: { page?: number; limit?: number; status?: string; source?: string; search?: string }) {
    const { page = 1, limit = 20, status, source, search } = params
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = adminSupabase
      .from('leads')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (status && status !== 'all') query = query.eq('status', status)
    if (source && source !== 'all') query = query.eq('source', source)
    if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`)

    const { data, error, count } = await query
    if (error) throw error
    return { data: data as Lead[], count: count ?? 0 }
  },

  async getById(id: string) {
    const { data, error } = await adminSupabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data as Lead
  },

  async update(id: string, payload: UpdateLeadPayload) {
    const { data, error } = await adminSupabase
      .from('leads')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as Lead
  },

  async delete(id: string) {
    const { error } = await adminSupabase
      .from('leads')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  async getNewCount() {
    const { count } = await adminSupabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'new')
    return count ?? 0
  },
}
