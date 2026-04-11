import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables } from '@/types/database'

export const MessageService = {
  async list(businessId: string, params: { branchId?: string; page?: number; limit?: number }) {
    const { branchId, page = 1, limit = 30 } = params
    let q = adminSupabase
      .from('messages')
      .select('*, profiles!sender_id(full_name,avatar_url), from_branch:branches!from_branch_id(name), to_branch:branches!to_branch_id(name)', { count: 'exact' })
      .eq('business_id', businessId)
      .is('parent_id', null) // Only top-level threads
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (branchId) {
      q = q.or(`to_branch_id.eq.${branchId},from_branch_id.eq.${branchId},to_branch_id.is.null`)
    }

    const { data, error, count } = await q
    if (error) throw error
    return { data, count }
  },

  async getThread(parentId: string) {
    const { data, error } = await adminSupabase
      .from('messages')
      .select('*, profiles!sender_id(full_name,avatar_url), from_branch:branches!from_branch_id(name), to_branch:branches!to_branch_id(name)')
      .eq('parent_id', parentId)
      .order('created_at')
    if (error) throw error
    return data
  },

  async send(payload: InsertTables<'messages'>) {
    const { data, error } = await adminSupabase.from('messages').insert(payload).select().single()
    if (error) throw error
    return data
  },

  async markRead(messageId: string) {
    await adminSupabase.from('messages').update({ is_read: true }).eq('id', messageId)
  },
}
