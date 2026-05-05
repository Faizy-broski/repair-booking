'use client'
import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { useMessageStore } from '@/store/message.store'
import { useNotificationStore } from '@/store/notification.store'
import { playMessageReceived } from '@/lib/message-sounds'

/**
 * Invisible component mounted once inside TenantLayout.
 *
 * Architecture — three layers working together:
 *
 *  1. Initial fetch  — on mount / branch change, load unread count + previews.
 *
 *  2. Supabase realtime  — instant badge updates via postgres_changes.
 *     Uses the shared createClient() (which carries the correct cookie domain
 *     in production) so the session JWT is present and RLS lets events through.
 *     On INSERT (top-level thread) → increment, add preview, play sound, toast.
 *     On UPDATE (is_read: true→false via DB trigger on reply) → same.
 *
 *  3. Polling fallback  — fetchUnread runs every POLL_MS as a reconciliation
 *     baseline. This makes the badge correct even when:
 *       • Migration 060 hasn't been applied yet (no realtime publication)
 *       • WebSocket connection is blocked by a corporate firewall
 *       • Realtime subscription times out / reconnects
 *     The poll does NOT play sounds (avoids re-alerting for already-known msgs).
 *     Page Visibility API triggers an immediate reconciliation when the tab
 *     comes back into focus.
 *
 * Owner / super_admin roles have no branch_id in their profile — they oversee
 * ALL branches. Their realtime filter checks any of their branches (not just
 * activeBranch), and fetchUnread omits branch_id so the API returns all
 * unread across the business.
 */

const POLL_MS = 8_000 // 8 s — feels near-realtime, low server cost

export function MessageBadge() {
  const router       = useRouter()
  const activeBranch = useAuthStore((s) => s.activeBranch)
  const branches     = useAuthStore((s) => s.branches)
  const allBranches  = useAuthStore((s) => s.canAccessAllBranches)()
  const { setUnreadCount, setUnreadMessages, addUnreadMessage, removeUnreadMessage, increment, setPendingThreadId } =
    useMessageStore()
  const notify = useNotificationStore((s) => s.add)

  // Stable refs for closures that must not be stale inside intervals / events
  const branchRef           = useRef(activeBranch)
  const branchesRef         = useRef(branches)
  const allBranchesRef      = useRef(allBranches)
  const unreadMessagesRef   = useRef(useMessageStore.getState().unreadMessages)
  /** true while the Supabase Realtime WS is SUBSCRIBED — polling skips when healthy */
  const realtimeHealthyRef  = useRef(false)
  useEffect(() => { branchRef.current = activeBranch }, [activeBranch])
  useEffect(() => { branchesRef.current = branches }, [branches])
  useEffect(() => { allBranchesRef.current = allBranches }, [allBranches])
  useEffect(() => {
    return useMessageStore.subscribe((s) => { unreadMessagesRef.current = s.unreadMessages })
  }, [])

  // Stable ref so realtime closures always call the latest version without
  // being re-created. Uses the Zustand store + router.push for smooth SPA
  // navigation — no hard reload, no full re-mount of the messages module.
  const goToThreadRef = useRef<(threadId: string) => void>(() => {})
  useEffect(() => {
    goToThreadRef.current = (threadId: string) => {
      setPendingThreadId(threadId)
      // Already on messages page → the page's pendingThreadId useEffect will
      // open the conversation without any navigation at all.
      if (!window.location.pathname.endsWith('/messages')) {
        router.push('/messages')
      }
    }
  }, [router, setPendingThreadId])

  // ── Core fetch function — replaces the whole badge state with server truth ──
  const fetchUnread = useCallback(async (silent = false) => {
    const branch = branchRef.current
    if (!branch) return
    try {
      // Always scope by active branch — this ensures the badge only shows messages
      // addressed TO this branch, preventing outgoing messages (from=active_branch)
      // from appearing as self-notifications. Owners see their active branch's
      // incoming messages; switching activeBranch shows another branch's badge.
      const url = `/api/messages/unread?branch_id=${branch.id}&active_branch_id=${branch.id}`
      const res  = await fetch(url)
      const json = await res.json()
      if (!res.ok) return
      const result = json.data ?? {}
      const newCount    = result.count    ?? 0
      const newMessages: typeof result.messages = result.messages ?? []

      if (!silent) {
        // Detect genuinely-new message IDs to play sound & toast once
        const known = new Set(unreadMessagesRef.current.map((m: { id: string }) => m.id))
        const fresh = newMessages.filter((m: { id: string }) => !known.has(m.id))
        if (fresh.length > 0) {
          playMessageReceived()
          fresh.forEach((m: { id: string; subject: string | null; body: string; from_branch_name: string | null }) => {
            notify({
              type:    'info',
              title:   'New Message',
              message: m.subject ? `"${m.subject}"` : 'You have a new message',
              duration: 6000,
              action: {
                label:   'View',
                onClick: () => goToThreadRef.current(m.id),
              },
            })
          })
        }
      }

      setUnreadCount(newCount)
      setUnreadMessages(newMessages)
    } catch { /* network error — keep previous state */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 1. Initial load whenever branch or role scope changes ──────────────────
  // allBranches re-triggers this when the profile loads after mount and the
  // owner scope switches from false→true. Re-fetching silently ensures the
  // unreadMessagesRef baseline covers all branches before the first poll fires,
  // preventing false-positive toasts for pre-existing messages on page refresh.
  useEffect(() => {
    if (!activeBranch) return
    fetchUnread(true) // silent=true — no sound/toast for pre-existing messages
  }, [activeBranch, allBranches, fetchUnread])

  // ── 3. Polling fallback + Page Visibility reconciliation ────────────────────
  // The interval is skipped when realtimeHealthyRef is true (WS is SUBSCRIBED).
  // Page-visibility always fires so the badge is corrected after a tab sleep.
  useEffect(() => {
    if (!activeBranch) return

    const interval = setInterval(() => {
      // Skip when Realtime is delivering events — avoids ~3,600 redundant
      // HTTP requests per 8-hour shift while keeping polling as a fallback.
      if (realtimeHealthyRef.current) return
      fetchUnread(false)
    }, POLL_MS)

    const onVisibility = () => {
      // Always reconcile on tab focus regardless of WS state
      if (document.visibilityState === 'visible') fetchUnread(false)
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [activeBranch, allBranches, fetchUnread])

  // ── 2. Supabase realtime — instant updates for zero-latency feel ────────────
  useEffect(() => {
    if (!activeBranch) return

    // CRITICAL: use the shared createClient() — it carries cookieOptions with
    // domain:.repairbooking.co.uk so the session JWT is readable in production.
    // A raw createBrowserClient(url, key) without these options cannot read
    // the auth cookie on tenant subdomains → realtime connects anonymous →
    // RLS blocks all postgres_changes events silently.
    const supabase = createClient()

    const channel = supabase
      .channel(`message-badge:${activeBranch.id}`)

      // INSERT — new message (top-level OR reply) ──────────────────────────────
      // Handles two cases:
      //   A) New top-level thread addressed to this branch → notify directly.
      //   B) Inbound reply (parent_id != null, to_branch_id = this branch) →
      //      the DB trigger only notifies the ORIGINAL RECIPIENT via UPDATE.
      //      To notify the ORIGINAL SENDER when the recipient replies back,
      //      we must handle the reply INSERT here directly.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as {
            id: string; parent_id: string | null; to_branch_id: string | null
            from_branch_id: string | null; subject: string | null
            body: string; is_read: boolean; created_at: string
          }
          const branch = branchRef.current
          if (!branch) return
          // Only process messages addressed TO the active branch — never outgoing ones.
          if (msg.to_branch_id !== branch.id) return
          // Only unread messages matter
          if (msg.is_read) return

          // For replies: use the parent (root) id so dropdown + navigation work correctly
          const previewId = msg.parent_id ?? msg.id
          // Avoid duplicate if polling already added this thread to the dropdown
          if (unreadMessagesRef.current.some((m) => m.id === previewId)) return

          increment()
          // Replace any stale root preview with updated content (latest body = reply body)
          removeUnreadMessage(previewId)
          addUnreadMessage({
            id:               previewId,
            subject:          msg.parent_id ? null : msg.subject, // replies don't carry root subject
            body:             msg.body,
            from_branch_id:   msg.from_branch_id,
            from_branch_name: null, // resolved in Topbar via branches store
            created_at:       msg.created_at,
          })
          playMessageReceived()
          notify({
            type: 'info',
            title: msg.parent_id ? 'New Reply' : 'New Message',
            message: msg.subject
              ? (msg.parent_id ? `New reply in "${msg.subject}"` : `"${msg.subject}"`)
              : 'You have a new message',
            duration: 6000,
            action: { label: 'View', onClick: () => goToThreadRef.current(previewId) },
          })
        }
      )

      // UPDATE — root thread marked unread by DB trigger (new reply arrived) ──
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const prev = payload.old as { id: string; parent_id: string | null; is_read: boolean; to_branch_id: string | null }
          const next = payload.new as { id: string; parent_id: string | null; is_read: boolean; to_branch_id: string | null; from_branch_id: string | null; subject: string | null; body: string; created_at: string }
          const branch = branchRef.current
          if (!branch || next.parent_id !== null) return
          // Only root messages addressed TO the active branch trigger badge updates.
          if (next.to_branch_id !== branch.id) return

          if (prev.is_read === true && next.is_read === false) {
            if (unreadMessagesRef.current.some((m) => m.id === next.id)) return
            increment()
            removeUnreadMessage(next.id)
            addUnreadMessage({
              id: next.id, subject: next.subject, body: next.body,
              from_branch_id: next.from_branch_id, from_branch_name: null,
              created_at: next.created_at,
            })
            playMessageReceived()
            notify({
              type: 'info', title: 'New Reply',
              message: next.subject ? `New reply in "${next.subject}"` : 'You have a new reply',
              duration: 6000,
              action: { label: 'View', onClick: () => goToThreadRef.current(next.id) },
            })
          }
        }
      )

      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          realtimeHealthyRef.current = true
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          realtimeHealthyRef.current = false
          // Realtime unavailable — polling fallback will keep badge accurate
          console.warn('[MessageBadge] Realtime subscription:', status, '— polling active as fallback')
        }
      })

    return () => { supabase.removeChannel(channel) }
  // Intentionally no callback deps — closures read from stable refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranch])

  return null
}
