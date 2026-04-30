import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables, UpdateTables } from '@/types/database'

export type BroadcastType = 'info' | 'warning' | 'downtime' | 'maintenance'
export type BroadcastStatus = 'draft' | 'active' | 'archived'

export interface SystemBroadcast {
  id: string
  created_by: string
  type: BroadcastType
  title: string
  body: string
  target_scope: 'all' | 'business'
  target_business_id: string | null
  status: BroadcastStatus
  expires_at: string | null
  created_at: string
  updated_at: string
}

export const BroadcastService = {
  /** Super-admin: list all broadcasts with optional status filter */
  async listAll(status?: BroadcastStatus): Promise<SystemBroadcast[]> {
    let query = adminSupabase
      .from('system_broadcasts')
      .select('*')
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as SystemBroadcast[]
  },

  /** Tenant-facing: active broadcasts relevant to a given business, not expired */
  async listActiveForBusiness(businessId: string): Promise<SystemBroadcast[]> {
    const now = new Date().toISOString()
    const { data, error } = await adminSupabase
      .from('system_broadcasts')
      .select('*')
      .eq('status', 'active')
      .or(`target_scope.eq.all,target_business_id.eq.${businessId}`)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []) as SystemBroadcast[]
  },

  async getById(id: string): Promise<SystemBroadcast | null> {
    const { data, error } = await adminSupabase
      .from('system_broadcasts')
      .select('*')
      .eq('id', id)
      .single()
    if (error) return null
    return data as SystemBroadcast
  },

  async create(payload: InsertTables<'system_broadcasts'>): Promise<SystemBroadcast> {
    const { data, error } = await adminSupabase
      .from('system_broadcasts')
      .insert({ ...payload, updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) throw error
    return data as SystemBroadcast
  },

  async update(id: string, payload: UpdateTables<'system_broadcasts'>): Promise<SystemBroadcast> {
    const { data, error } = await adminSupabase
      .from('system_broadcasts')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as SystemBroadcast
  },

  /** Publish a draft — triggers Realtime UPDATE event to all connected tenants */
  async publish(id: string): Promise<SystemBroadcast> {
    return BroadcastService.update(id, { status: 'active' })
  },

  async archive(id: string): Promise<SystemBroadcast> {
    return BroadcastService.update(id, { status: 'archived' })
  },

  /** Mark a broadcast read for a profile — upserts to avoid duplicates */
  async markRead(broadcastId: string, profileId: string): Promise<void> {
    const { error } = await adminSupabase
      .from('broadcast_reads')
      .upsert(
        { broadcast_id: broadcastId, profile_id: profileId, read_at: new Date().toISOString() },
        { onConflict: 'broadcast_id,profile_id' }
      )
    if (error) throw error
  },

  /** Get set of broadcast IDs already read by this profile */
  async getReadIds(profileId: string, broadcastIds: string[]): Promise<string[]> {
    if (broadcastIds.length === 0) return []
    const { data, error } = await adminSupabase
      .from('broadcast_reads')
      .select('broadcast_id')
      .eq('profile_id', profileId)
      .in('broadcast_id', broadcastIds)
    if (error) throw error
    return (data ?? []).map((r) => r.broadcast_id)
  },
}
