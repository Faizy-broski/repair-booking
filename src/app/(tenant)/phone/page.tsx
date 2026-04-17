'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Phone, PhoneOff, PhoneCall, PhoneMissed, Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/auth.store'
import { createBrowserClient } from '@supabase/ssr'

interface OnlineBranch {
  id: string
  name: string
  isOnline: boolean
}

type CallStatus = 'idle' | 'calling' | 'incoming' | 'connected'

export default function PhonePage() {
  const { activeBranch, branches } = useAuthStore()
  const [onlineBranches, setOnlineBranches] = useState<OnlineBranch[]>([])
  const [callStatus, setCallStatus] = useState<CallStatus>('idle')
  const [callTarget, setCallTarget] = useState<OnlineBranch | null>(null)
  const [callerInfo, setCallerInfo] = useState<{ branchId: string; branchName: string } | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerOff, setIsSpeakerOff] = useState(false)
  const [callDuration, setCallDuration] = useState(0)

  const peerRef = useRef<any>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const channelRef = useRef<any>(null)
  const callTimerRef = useRef<NodeJS.Timeout | null>(null)
  // Stores the SDP offer received from the caller so acceptCall() can feed it
  // to the callee peer via peer.signal(). Without this the callee peer cannot
  // generate an answer and the call hangs indefinitely.
  const incomingOfferRef = useRef<any>(null)
  // Buffers trickle-ICE candidates that arrive before the callee peer is created
  // (i.e. before the user clicks "Answer"). They are replayed in acceptCall().
  const pendingIceCandidatesRef = useRef<any[]>([])

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const setupPresenceChannel = useCallback(() => {
    if (!activeBranch) return

    const channel = supabase.channel('branch-phone', {
      config: { presence: { key: activeBranch.id } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const online = branches.map((b) => ({
          id: b.id,
          name: b.name,
          isOnline: b.id !== activeBranch.id && b.id in state,
        }))
        setOnlineBranches(online.filter((b) => b.id !== activeBranch.id))
      })
      .on('broadcast', { event: 'call-signal' }, async ({ payload }) => {
        if (payload.to !== activeBranch.id) return

        if (payload.type === 'offer') {
          incomingOfferRef.current = payload.data   // must be fed to the callee peer in acceptCall()
          setCallerInfo({ branchId: payload.from, branchName: payload.fromName })
          setCallStatus('incoming')
        }

        if (payload.type === 'answer' && peerRef.current) {
          peerRef.current.signal(payload.data)
        }

        if (payload.type === 'ice-candidate') {
          if (peerRef.current) {
            peerRef.current.signal(payload.data)
          } else {
            // Peer not yet created — buffer for replay after acceptCall() creates it
            pendingIceCandidatesRef.current.push(payload.data)
          }
        }

        if (payload.type === 'hangup') {
          endCall(false)
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ branch_id: activeBranch.id, branch_name: activeBranch.name })
        }
      })

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [activeBranch, branches]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cleanup = setupPresenceChannel()
    return cleanup
  }, [setupPresenceChannel])

  async function startCall(target: OnlineBranch) {
    if (!activeBranch) return
    setCallTarget(target)
    setCallStatus('calling')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream

      // Dynamically import simple-peer to avoid SSR issues
      const SimplePeer = (await import('simple-peer')).default
      const peer = new SimplePeer({ initiator: true, stream, trickle: true })

      peer.on('signal', (data: any) => {
        channelRef.current?.send({
          type: 'broadcast',
          event: 'call-signal',
          payload: {
            type: data.type === 'offer' ? 'offer' : 'ice-candidate',
            from: activeBranch.id,
            fromName: activeBranch.name,
            to: target.id,
            data,
          },
        })
      })

      peer.on('stream', (remoteStream: MediaStream) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream
          remoteAudioRef.current.play()
        }
        setCallStatus('connected')
        startTimer()
      })

      peer.on('error', () => endCall(true))
      peerRef.current = peer
    } catch {
      setCallStatus('idle')
      setCallTarget(null)
    }
  }

  async function acceptCall() {
    if (!activeBranch || !callerInfo) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream

      const SimplePeer = (await import('simple-peer')).default
      const peer = new SimplePeer({ initiator: false, stream, trickle: true })

      peer.on('signal', (data: any) => {
        channelRef.current?.send({
          type: 'broadcast',
          event: 'call-signal',
          payload: {
            type: data.type === 'answer' ? 'answer' : 'ice-candidate',
            from: activeBranch.id,
            to: callerInfo.branchId,
            data,
          },
        })
      })

      peer.on('stream', (remoteStream: MediaStream) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream
          remoteAudioRef.current.play()
        }
        setCallStatus('connected')
        startTimer()
      })

      peer.on('error', () => endCall(true))
      peerRef.current = peer

      // Feed the stored SDP offer to this peer so it can generate an answer.
      // This MUST happen after peerRef.current is set so that any ICE candidates
      // emitted synchronously during signal() are captured by the 'signal' handler above.
      if (incomingOfferRef.current) {
        peer.signal(incomingOfferRef.current)
        incomingOfferRef.current = null
      }
      // Replay any trickle-ICE candidates that arrived before this peer was created
      pendingIceCandidatesRef.current.forEach((c) => peer.signal(c))
      pendingIceCandidatesRef.current = []
    } catch {
      rejectCall()
    }
  }

  function rejectCall() {
    if (callerInfo) {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'call-signal',
        payload: { type: 'hangup', from: activeBranch?.id, to: callerInfo.branchId },
      })
    }
    setCallStatus('idle')
    setCallerInfo(null)
  }

  function endCall(sendSignal = true) {
    if (sendSignal && (callTarget || callerInfo)) {
      const targetId = callTarget?.id ?? callerInfo?.branchId
      channelRef.current?.send({
        type: 'broadcast',
        event: 'call-signal',
        payload: { type: 'hangup', from: activeBranch?.id, to: targetId },
      })
    }
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null }
    incomingOfferRef.current = null
    pendingIceCandidatesRef.current = []
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach((t) => t.stop()); localStreamRef.current = null }
    if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null }
    setCallStatus('idle')
    setCallTarget(null)
    setCallerInfo(null)
    setCallDuration(0)
    setIsMuted(false)
  }

  function startTimer() {
    callTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000)
  }

  function toggleMute() {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !isMuted })
      setIsMuted(!isMuted)
    }
  }

  function toggleSpeaker() {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !isSpeakerOff
      setIsSpeakerOff(!isSpeakerOff)
    }
  }

  function formatDuration(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Branch Phone</h1>
        <p className="text-sm text-gray-500">Internal WebRTC calling between branches</p>
      </div>

      <audio ref={remoteAudioRef} className="hidden" />

      {/* Incoming call alert */}
      {callStatus === 'incoming' && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 animate-pulse">
                <PhoneCall className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-green-900">Incoming call</p>
                <p className="text-sm text-green-700">{callerInfo?.branchName}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={rejectCall}>
                <PhoneOff className="h-4 w-4" /> Decline
              </Button>
              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={acceptCall}>
                <Phone className="h-4 w-4" /> Answer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Active call */}
      {(callStatus === 'connected' || callStatus === 'calling') && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 text-center">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-blue-100">
            <Phone className="h-7 w-7 text-blue-600" />
          </div>
          <p className="mt-3 font-semibold text-blue-900">
            {callStatus === 'calling' ? 'Calling...' : 'Connected'}
          </p>
          <p className="text-sm text-blue-700">{callTarget?.name ?? callerInfo?.branchName}</p>
          {callStatus === 'connected' && (
            <p className="mt-1 font-mono text-lg text-blue-800">{formatDuration(callDuration)}</p>
          )}
          <div className="mt-4 flex justify-center gap-3">
            <button
              onClick={toggleMute}
              className={`flex h-10 w-10 items-center justify-center rounded-full ${isMuted ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}
            >
              {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <button
              onClick={() => endCall(true)}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
            <button
              onClick={toggleSpeaker}
              className={`flex h-10 w-10 items-center justify-center rounded-full ${isSpeakerOff ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}
            >
              {isSpeakerOff ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Branch directory */}
      {callStatus === 'idle' && (
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h3 className="font-medium text-gray-900">Branch Directory</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {onlineBranches.length === 0 ? (
              <div className="flex h-24 items-center justify-center text-sm text-gray-400">
                No other branches available
              </div>
            ) : (
              onlineBranches.map((branch) => (
                <div key={branch.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-2.5 w-2.5 rounded-full ${branch.isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div>
                      <p className="font-medium text-gray-900">{branch.name}</p>
                      <Badge variant={branch.isOnline ? 'success' : 'default'} className="text-[10px]">
                        {branch.isOnline ? 'Online' : 'Offline'}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={!branch.isOnline}
                    onClick={() => startCall(branch)}
                  >
                    <Phone className="h-3.5 w-3.5" /> Call
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
