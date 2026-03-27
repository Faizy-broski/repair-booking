'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export type CallState = 'idle' | 'ringing' | 'active' | 'ended'

interface UseWebRtcOptions {
  businessId: string
  branchId: string
  onIncomingCall?: (fromBranchId: string, offer: RTCSessionDescriptionInit) => void
}

/**
 * WebRTC hook for branch-to-branch calls.
 * Uses Supabase Realtime as the signaling channel and simple-peer-style RTCPeerConnection.
 *
 * Signaling channel: `phone:{businessId}`
 * Events: call-request | offer | answer | ice-candidate | hang-up
 */
export function useWebRtc({ businessId, branchId, onIncomingCall }: UseWebRtcOptions) {
  const [callState, setCallState] = useState<CallState>('idle')
  const [remoteBranchId, setRemoteBranchId] = useState<string | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const channelName = `phone:${businessId}`

  const getOrCreatePeer = useCallback(() => {
    if (peerRef.current) return peerRef.current
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })
    peerRef.current = pc
    return pc
  }, [])

  const sendSignal = useCallback(
    async (type: string, data: unknown, toBranchId: string | null = null) => {
      const supabase = createClient()
      const channel = supabase.channel(channelName)
      await channel.send({
        type: 'broadcast',
        event: type,
        payload: { from_branch_id: branchId, to_branch_id: toBranchId, data },
      })
      await supabase.removeChannel(channel)
    },
    [channelName, branchId]
  )

  // Subscribe to signaling events
  useEffect(() => {
    if (!businessId || !branchId) return

    const supabase = createClient()
    const channel = supabase
      .channel(channelName)
      .on('broadcast', { event: 'call-request' }, async ({ payload }) => {
        if (payload.to_branch_id !== branchId) return
        setRemoteBranchId(payload.from_branch_id)
        setCallState('ringing')
        onIncomingCall?.(payload.from_branch_id, payload.data)
      })
      .on('broadcast', { event: 'offer' }, async ({ payload }) => {
        if (payload.to_branch_id !== branchId) return
        const pc = getOrCreatePeer()
        await pc.setRemoteDescription(payload.data)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        sendSignal('answer', answer, payload.from_branch_id)
        setCallState('active')
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (payload.to_branch_id !== branchId) return
        const pc = peerRef.current
        if (pc) await pc.setRemoteDescription(payload.data)
        setCallState('active')
      })
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload.to_branch_id !== branchId) return
        const pc = peerRef.current
        if (pc && payload.data) await pc.addIceCandidate(payload.data)
      })
      .on('broadcast', { event: 'hang-up' }, ({ payload }) => {
        if (payload.to_branch_id !== branchId) return
        hangUp()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [businessId, branchId, channelName, getOrCreatePeer, sendSignal, onIncomingCall])

  const callBranch = useCallback(
    async (targetBranchId: string, localStream: MediaStream) => {
      setRemoteBranchId(targetBranchId)
      setCallState('ringing')

      const pc = getOrCreatePeer()
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream))

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) sendSignal('ice-candidate', candidate, targetBranchId)
      }

      await sendSignal('call-request', null, targetBranchId)

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      sendSignal('offer', offer, targetBranchId)
    },
    [getOrCreatePeer, sendSignal]
  )

  const acceptCall = useCallback(
    async (fromBranchId: string, offer: RTCSessionDescriptionInit, localStream: MediaStream) => {
      const pc = getOrCreatePeer()
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream))

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) sendSignal('ice-candidate', candidate, fromBranchId)
      }

      await pc.setRemoteDescription(offer)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      sendSignal('answer', answer, fromBranchId)
      setCallState('active')
    },
    [getOrCreatePeer, sendSignal]
  )

  const hangUp = useCallback(() => {
    if (remoteBranchId) sendSignal('hang-up', null, remoteBranchId)
    peerRef.current?.close()
    peerRef.current = null
    setCallState('ended')
    setTimeout(() => {
      setCallState('idle')
      setRemoteBranchId(null)
    }, 1500)
  }, [remoteBranchId, sendSignal])

  return { callState, remoteBranchId, callBranch, acceptCall, hangUp }
}
