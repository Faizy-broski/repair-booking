import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables } from '@/types/database'

export const MessageService = {
  async list(businessId: string, params: { branchId?: string; page?: number; limit?: number }) {
    const { branchId, page = 1, limit = 50 } = params
    let q = adminSupabase
      .from('messages')
      // replies:messages!parent_id embeds child rows so the client can compute
      // a per-thread unread count badge filtered by to_branch_id (current branch).
      .select(
        '*, profiles!sender_id(full_name,avatar_url), from_branch:branches!from_branch_id(name), to_branch:branches!to_branch_id(name), replies:messages!parent_id(id,is_read,to_branch_id)',
        { count: 'exact' }
      )
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

  async getThread(rootId: string) {
    // Include the root message itself AND all replies so the first message is visible
    const { data, error } = await adminSupabase
      .from('messages')
      .select('*, profiles!sender_id(full_name,avatar_url), from_branch:branches!from_branch_id(name), to_branch:branches!to_branch_id(name)')
      .or(`id.eq.${rootId},parent_id.eq.${rootId}`)
      .order('created_at')
      .limit(200)
    if (error) throw error
    return data ?? []
  },

  async send(payload: InsertTables<'messages'>) {
    const { data, error } = await adminSupabase.from('messages').insert(payload).select().single()
    if (error) throw error
    return data
  },

  async markRead(rootId: string) {
    // Mark the root message AND every reply in the same thread as read in one
    // query so the unread count stays accurate and replies don't accumulate as
    // phantom-unread rows.
    const { error } = await adminSupabase
      .from('messages')
      .update({ is_read: true })
      .or(`id.eq.${rootId},parent_id.eq.${rootId}`)
    if (error) throw error
  },

  async unreadCount(businessId: string, branchId?: string) {
    let q = adminSupabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('is_read', false)

    // Count only top-level threads (not individual replies) to avoid inflated numbers
    q = q.is('parent_id', null)

    if (branchId) {
      q = q.eq('to_branch_id', branchId)
    }

    const { count, error } = await q
    if (error) throw error
    return count ?? 0
  },

  /**
   * Fetch the unread count + latest 10 preview items for the bell dropdown.
   *
   * Correct model:
   *   Each message row has its own is_read flag that represents whether the
   *   addressed recipient (to_branch_id) has read that specific message.
   *   A "thread with unread content" for branchX means: at least one message
   *   in the thread (root OR reply) has to_branch_id = branchX AND is_read = false.
   *
   * Previous bug: only looked at root messages — missed the case where the
   * ORIGINAL SENDER gets a reply (the reply row has to_branch_id = sender,
   * but the root has to_branch_id = original recipient).
   */
  async listUnread(businessId: string, branchId?: string) {
    // Fetch all unread messages (root + replies) addressed to this branch.
    // We'll group by thread, count unique threads, and pick the latest message
    // body per thread as the preview.
    let unreadQ = adminSupabase
      .from('messages')
      .select('id, subject, body, created_at, parent_id, from_branch_id, from_branch:branches!from_branch_id(name)')
      .eq('business_id', businessId)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(100) // fetch enough to cover 10+ threads with multiple unread msgs

    if (branchId) {
      unreadQ = unreadQ.eq('to_branch_id', branchId)
    }

    const { data: unreadData, error } = await unreadQ
    if (error) throw error

    const allUnread = (unreadData ?? []) as any[]

    // Build a map: rootId → preview (latest unread message in that thread)
    const threadMap = new Map<string, {
      id: string; subject: string | null; body: string
      from_branch_id: string | null; from_branch_name: string | null
      created_at: string
    }>()

    // Collect root IDs that are only referenced via replies (need subject lookup)
    const rootsFromReplies = new Set<string>()

    for (const m of allUnread) {
      const rootId = (m.parent_id ?? m.id) as string
      if (m.parent_id) rootsFromReplies.add(rootId)

      const existing = threadMap.get(rootId)
      if (!existing || new Date(m.created_at) > new Date(existing.created_at)) {
        threadMap.set(rootId, {
          id:               rootId,
          subject:          m.parent_id ? null : (m.subject ?? null), // filled below for replies
          body:             m.body,
          from_branch_id:   m.from_branch_id ?? null,
          from_branch_name: (m.from_branch as any)?.name ?? null,
          created_at:       m.created_at,
        })
      }
    }

    // For threads we only have replies for, fetch the root subject
    const replyOnlyRoots = [...rootsFromReplies].filter(
      (id) => !allUnread.some((m: any) => !m.parent_id && m.id === id)
    )
    if (replyOnlyRoots.length > 0) {
      const { data: roots } = await adminSupabase
        .from('messages')
        .select('id, subject')
        .in('id', replyOnlyRoots)

      for (const root of roots ?? []) {
        const preview = threadMap.get(root.id)
        if (preview && preview.subject === null) {
          preview.subject = root.subject ?? null
        }
      }
    }

    const messages = [...threadMap.values()]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)

    return {
      count: threadMap.size,
      messages,
    }
  },
}
