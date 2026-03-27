/**
 * WebRTC Service — Supabase Realtime signaling for branch-to-branch calls.
 * Actual peer connection is managed client-side via simple-peer.
 * This service manages call state persistence and signaling records.
 */
import { adminSupabase } from '@/backend/config/supabase'

export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed'

export interface CallRecord {
  id: string
  from_branch_id: string
  to_branch_id: string
  business_id: string
  status: CallStatus
  started_at: string
  ended_at?: string | null
}

export const WebRtcService = {
  /**
   * Broadcast a signaling message via Supabase Realtime broadcast.
   * The channel name is `phone:{business_id}`.
   * Clients subscribe to this channel to receive offer/answer/ice-candidate events.
   */
  async broadcastSignal(
    businessId: string,
    payload: {
      type: 'offer' | 'answer' | 'ice-candidate' | 'hang-up' | 'call-request'
      from_branch_id: string
      to_branch_id: string | null
      data: unknown
    }
  ) {
    const channel = adminSupabase.channel(`phone:${businessId}`)
    await channel.send({
      type: 'broadcast',
      event: payload.type,
      payload,
    })
    await adminSupabase.removeChannel(channel)
  },

  async getOnlineBranches(businessId: string): Promise<string[]> {
    // Presence is tracked client-side via Supabase Realtime presence.
    // This method is a placeholder; actual presence state lives in the browser.
    const { data } = await adminSupabase
      .from('branches')
      .select('id')
      .eq('business_id', businessId)
      .eq('is_active', true)
    return (data ?? []).map((b) => b.id)
  },
}
