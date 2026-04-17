'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Send, Plus, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { useAuthStore } from '@/store/auth.store'
import { useNotificationStore } from '@/store/notification.store'
import { useMessageStore } from '@/store/message.store'
import { formatDateTime } from '@/lib/utils'
import { playMessageSent } from '@/lib/message-sounds'
import { createClient } from '@/lib/supabase/client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'

interface MessageRow {
  id: string
  subject: string | null
  body: string
  is_read: boolean
  created_at: string
  sender_id: string
  parent_id: string | null
  from_branch_id: string | null
  to_branch_id: string | null
  from_branch?: { name: string } | null
  to_branch?: { name: string } | null
  profiles?: { full_name: string | null } | null
  /** Embedded replies returned by the list query for per-branch unread count. */
  replies?: { id: string; is_read: boolean; to_branch_id: string | null }[] | null
}

/**
 * Returns the total unread message count for a thread as seen by branchId.
 * Counts only messages addressed to THIS branch that are unread — avoids
 * showing inflated counts from messages addressed to the other branch.
 */
function threadUnreadCount(msg: MessageRow, branchId: string): number {
  const rootUnread = (!msg.is_read && msg.to_branch_id === branchId) ? 1 : 0
  const replyUnread = msg.replies?.filter(
    (r) => !r.is_read && r.to_branch_id === branchId
  ).length ?? 0
  return rootUnread + replyUnread
}

const composeSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Message is required'),
  to_branch_id: z.string().uuid('Please select a branch'),
})
type ComposeForm = z.infer<typeof composeSchema>

export default function MessagesPage() {
  const { activeBranch, branches, profile } = useAuthStore()
  const notify = useNotificationStore((s) => s.add)
  const decrement = useMessageStore((s) => s.decrement)
  const removeUnreadMessage = useMessageStore((s) => s.removeUnreadMessage)
  const pendingThreadId    = useMessageStore((s) => s.pendingThreadId)
  const setPendingThreadId = useMessageStore((s) => s.setPendingThreadId)

  const getBranchName = (msg: MessageRow | null | undefined, type: 'from' | 'to') => {
    if (!msg) return 'Unknown'
    const loaded = type === 'from' ? msg.from_branch?.name : msg.to_branch?.name
    if (loaded) return loaded
    const id = type === 'from' ? msg.from_branch_id : msg.to_branch_id
    if (!id && type === 'from') return 'Main Branch'
    return branches.find((b) => b.id === id)?.name ?? 'Unknown'
  }

  const [messages, setMessages] = useState<MessageRow[]>([])
  const [selected, setSelected] = useState<MessageRow | null>(null)
  const [thread, setThread] = useState<MessageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Refs so the Supabase subscription never captures stale state
  const selectedRef = useRef<MessageRow | null>(null)
  const threadEndRef = useRef<HTMLDivElement>(null)
  const replyInputRef = useRef<HTMLTextAreaElement>(null)
  // Stable callback refs — updated every render so the subscription closure
  // never needs to list them as dependencies (avoids channel teardown/rebuild).
  const fetchMessagesRef = useRef<() => void>(() => {})
  const fetchThreadRef = useRef<(id: string) => void>(() => {})
  const notifyRef = useRef(notify)
  // Stable refs for store actions used inside realtime closures
  const decrementRef = useRef(decrement)
  const removeUnreadMessageRef = useRef(removeUnreadMessage)
  // Pending thread ID from ?thread=<id> URL param — auto-opens on first messages load
  const pendingThreadRef = useRef<string | null>(null)
  // Stable ref to onSelectMessage so auto-open useEffect can call it without
  // needing it as a dependency (avoids infinite effect loops)
  const onSelectMessageRef = useRef<(msg: MessageRow) => void>(() => {})

  useEffect(() => { selectedRef.current = selected }, [selected])
  useEffect(() => { notifyRef.current = notify }, [notify])
  useEffect(() => { decrementRef.current = decrement }, [decrement])
  useEffect(() => { removeUnreadMessageRef.current = removeUnreadMessage }, [removeUnreadMessage])

  // Read ?thread=<id> from URL on mount and clean the URL immediately
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const threadId = params.get('thread')
    if (threadId) {
      pendingThreadRef.current = threadId
      window.history.replaceState({}, '', '/messages')
    }
  }, [])

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ComposeForm>({
    resolver: zodResolver(composeSchema),
  })

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    if (!activeBranch) return
    const res = await fetch(`/api/messages?branch_id=${activeBranch.id}`)
    const json = await res.json()
    setMessages(json.data ?? [])
    setLoading(false)
  }, [activeBranch])

  const fetchThread = useCallback(async (rootId: string) => {
    const res = await fetch(`/api/messages/${rootId}`)
    const json = await res.json()
    setThread(json.data ?? [])
    setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
  }, [])

  // Keep callback refs always pointing to the latest version
  useEffect(() => { fetchMessagesRef.current = fetchMessages }, [fetchMessages])
  useEffect(() => { fetchThreadRef.current = fetchThread }, [fetchThread])
  useEffect(() => { onSelectMessageRef.current = onSelectMessage }, )

  // Auto-open thread when ?thread param was in the URL (handles initial page load)
  useEffect(() => {
    const threadId = pendingThreadRef.current
    if (!threadId || messages.length === 0 || selected) return
    const msg = messages.find((m) => m.id === threadId)
    if (msg) {
      pendingThreadRef.current = null
      onSelectMessageRef.current(msg)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  // Auto-open thread when the bell dropdown sets pendingThreadId in the store.
  // This fires whether or not the user is already on the messages page.
  useEffect(() => {
    if (!pendingThreadId) return
    if (messages.length === 0) return // wait for messages to load
    const msg = messages.find((m) => m.id === pendingThreadId)
    if (msg) {
      setPendingThreadId(null)
      onSelectMessageRef.current(msg)
    } else {
      // Thread not in current list (maybe from a different branch or not loaded yet);
      // fall back to URL-based navigation which will load the page fresh.
      setPendingThreadId(null)
      window.location.href = `/messages?thread=${pendingThreadId}`
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingThreadId, messages])

  // Reset + reload when the active branch changes
  useEffect(() => {
    setSelected(null)
    setThread([])
    setLoading(true)
    fetchMessages()
  }, [fetchMessages])

  // ── Polling fallback + Page Visibility reconciliation ──────────────────────
  // Fires every 8 s to keep the conversation list accurate even when realtime
  // is unavailable (migration not applied, WS blocked, cold reconnect, etc.).
  // Also fires immediately when the tab comes back into focus.
  useEffect(() => {
    if (!activeBranch) return

    const LIST_POLL_MS   = 8_000
    const THREAD_POLL_MS = 5_000

    const listInterval = setInterval(() => fetchMessagesRef.current(), LIST_POLL_MS)

    // Poll the open thread so new replies appear without reload
    const threadInterval = setInterval(() => {
      const sel = selectedRef.current
      if (!sel) return
      const rootId = sel.parent_id ?? sel.id
      fetchThreadRef.current(rootId)
    }, THREAD_POLL_MS)

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      fetchMessagesRef.current()
      const sel = selectedRef.current
      if (sel) fetchThreadRef.current(sel.parent_id ?? sel.id)
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(listInterval)
      clearInterval(threadInterval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [activeBranch])

  // ── Realtime subscription ──────────────────────────────────────────────────
  // Depends ONLY on activeBranch so the channel is never torn down by callback
  // reference changes. All callbacks are read from stable refs instead.
  useEffect(() => {
    if (!activeBranch) return

    // CRITICAL: use shared createClient() — carries correct cookie domain in
    // production so the JWT is present and RLS permits postgres_changes events.
    const supabase = createClient()

    const channel = supabase
      .channel(`messages:${activeBranch.id}`)

      // ── INSERT: new message or reply created ────────────────────────────────
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        const msg = payload.new as MessageRow

        // Only process messages relevant to the active branch
        if (msg.to_branch_id !== activeBranch.id && msg.from_branch_id !== activeBranch.id) return

        if (!msg.parent_id) {
          // New top-level thread — refresh the list to show it
          fetchMessagesRef.current()
          if (msg.to_branch_id === activeBranch.id) {
            notifyRef.current({
              type: 'info',
              title: 'New Message',
              message: msg.subject ? `"${msg.subject}"` : 'You have a new message',
              duration: 5000,
            })
          }
        } else {
          // New reply — if it belongs to the currently-open thread, reload the thread view.
          const sel = selectedRef.current
          if (sel) {
            const openRootId = sel.parent_id ?? sel.id
            if (msg.parent_id === openRootId) {
              fetchThreadRef.current(openRootId)

              // Only mark-read + decrement for INBOUND replies (not our own sends).
              // Calling decrement for outbound replies corrupts the badge count:
              // the trigger won't have marked anything unread for our own branch,
              // so there is nothing to decrement.
              const isInbound = msg.from_branch_id !== activeBranch.id
              if (isInbound) {
                // User is viewing this thread → mark it read immediately so the
                // badge/dropdown don't flicker with a spurious "new reply".
                fetch(`/api/messages/${openRootId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ is_read: true }),
                }).then(() => {
                  decrementRef.current()
                  removeUnreadMessageRef.current(openRootId)
                }).catch(() => {})
              }
            }
          }
          // Refresh list so unread dots stay accurate on all conversations
          fetchMessagesRef.current()
        }
      })

      // ── UPDATE: root row changed (DB trigger set is_read=false on reply) ────
      // This fires when migration-062 trigger marks the parent thread unread
      // because a reply arrived. We refresh the conversation list so the
      // unread dot appears on the correct row.
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        const prev = payload.old as { id: string; parent_id: string | null; is_read: boolean }
        const next = payload.new as MessageRow

        // Only care about root messages
        if (next.parent_id !== null) return
        // Only relevant to this branch
        if (next.to_branch_id !== activeBranch.id && next.from_branch_id !== activeBranch.id) return

        if (prev.is_read === true && next.is_read === false) {
          // A reply just arrived for this thread. If the thread is currently open,
          // the INSERT handler already re-marked it as read — nothing to do here.
          const sel = selectedRef.current
          const openRootId = sel ? (sel.parent_id ?? sel.id) : null
          if (openRootId === next.id) return

          // Thread is NOT open — refresh the list to show the unread dot
          fetchMessagesRef.current()
        }
      })

      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Polling fallback above keeps the UI current even when realtime fails
          console.warn('[Messages] Realtime subscription:', status, '— polling active')
        }
      })

    return () => { supabase.removeChannel(channel) }
  }, [activeBranch])

  // ── Actions ────────────────────────────────────────────────────────────────

  async function onSelectMessage(msg: MessageRow) {
    setSelected(msg)
    const rootId = msg.parent_id ?? msg.id
    await fetchThread(rootId)

    if (!msg.is_read) {
      fetch(`/api/messages/${msg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_read: true }),
      }).then(() => {
        decrement()
        removeUnreadMessage(msg.id)
        fetchMessages()
      })
    }
    setTimeout(() => replyInputRef.current?.focus(), 150)
  }

  async function onReply() {
    if (!replyBody.trim() || !selected || !activeBranch) return
    setSending(true)
    const rootId = selected.parent_id ?? selected.id
    const isFromMe = selected.from_branch_id === activeBranch.id

    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_branch_id: activeBranch.id,
          to_branch_id: isFromMe ? selected.to_branch_id : selected.from_branch_id,
          subject: selected.subject,
          body: replyBody,
          parent_id: rootId,
        }),
      })
      playMessageSent()
      setReplyBody('')
      await fetchThread(rootId)
    } finally {
      setSending(false)
    }
  }

  async function onCompose(data: ComposeForm) {
    if (!activeBranch) return
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, from_branch_id: activeBranch.id }),
    })
    if (res.ok) {
      playMessageSent()
      reset()
      setSheetOpen(false)
      fetchMessages()
    }
  }

  const otherBranches = branches.filter((b) => b.id !== activeBranch?.id)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)] overflow-hidden bg-surface-container-lowest">

      {/* ── Thread list ──────────────────────────────────── */}
      <div className="flex w-72 shrink-0 flex-col border-r border-outline-variant">
        <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-4 py-3">
          <h1 className="font-semibold text-on-surface">Messages</h1>
          <button
            onClick={() => setSheetOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-on-primary shadow-sm transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="border-b border-outline-variant p-3 space-y-2">
                <div className="h-3 w-3/4 animate-pulse rounded bg-surface-container" />
                <div className="h-2 w-1/2 animate-pulse rounded bg-surface-container" />
              </div>
            ))
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-on-surface-variant">
              <MessageSquare className="h-8 w-8 opacity-30" />
              <p className="text-sm">No messages yet</p>
            </div>
          ) : (
            messages.map((msg) => {
              const openRootId = selected ? (selected.parent_id ?? selected.id) : null
              const thisRootId = msg.parent_id ?? msg.id
              const isActive   = openRootId === thisRootId
              const unread     = threadUnreadCount(msg, activeBranch?.id ?? '')
              return (
                <button
                  key={msg.id}
                  onClick={() => onSelectMessage(msg)}
                  className={[
                    'w-full border-b border-outline-variant px-4 py-3 text-left transition-colors',
                    'border-l-[3px]',
                    isActive
                      ? 'border-l-primary bg-primary-container/15 hover:bg-primary-container/20'
                      : 'border-l-transparent hover:bg-surface-container-low',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={`truncate text-sm leading-snug ${
                      unread > 0 ? 'font-semibold text-on-surface' : 'font-normal text-on-surface-variant'
                    }`}>
                      {msg.subject || '(no subject)'}
                    </p>
                    {unread > 0 && (
                      <span className="mt-0.5 flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-on-primary">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-outline">
                    {getBranchName(msg, 'from')} → {getBranchName(msg, 'to')}
                  </p>
                  <p className="mt-0.5 text-[11px] text-outline">
                    {formatDateTime(msg.created_at)}
                  </p>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Chat area ──────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0">
        {selected ? (
          <>
            {/* Header */}
            <div className="shrink-0 border-b border-outline-variant bg-surface-container-lowest px-6 py-3">
              <h2 className="font-semibold text-on-surface truncate">
                {selected.subject || '(no subject)'}
              </h2>
              <p className="text-xs text-outline">
                {getBranchName(selected, 'from')} → {getBranchName(selected, 'to')}
              </p>
            </div>

            {/* Messages scroll area */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {thread.length === 0 ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : (
                thread.map((msg) => {
                  const isMine = msg.sender_id === profile?.id
                  const senderName = msg.profiles?.full_name ?? getBranchName(msg, 'from')
                  const initials = senderName.charAt(0).toUpperCase()
                  return (
                    <div key={msg.id} className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                      {/* Avatar */}
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        isMine
                          ? 'bg-primary text-on-primary'
                          : 'bg-secondary-container text-on-secondary-container'
                      }`}>
                        {initials}
                      </div>

                      <div className={`flex max-w-[65%] flex-col gap-1 ${isMine ? 'items-end' : 'items-start'}`}>
                        {!isMine && (
                          <p className="px-1 text-[11px] font-medium text-outline">{senderName}</p>
                        )}
                        <div className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                          isMine
                            ? 'rounded-tr-sm bg-primary text-on-primary'
                            : 'rounded-tl-sm bg-surface-container text-on-surface'
                        }`}>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.body}</p>
                        </div>
                        <p className={`px-1 text-[10px] text-outline ${isMine ? 'text-right' : ''}`}>
                          {formatDateTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={threadEndRef} className="h-1" />
            </div>

            {/* Reply bar — always visible at the bottom */}
            <div className="shrink-0 border-t border-outline-variant bg-surface-container-lowest px-4 py-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={replyInputRef}
                  value={replyBody}
                  onChange={(e) => {
                    setReplyBody(e.target.value)
                    // auto-grow
                    e.target.style.height = 'auto'
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      onReply()
                    }
                  }}
                  placeholder="Type a reply… (Enter to send, Shift+Enter for new line)"
                  rows={1}
                  className="flex-1 resize-none overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low px-4 py-2.5 text-sm text-on-surface placeholder:text-outline focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
                />
                <button
                  onClick={onReply}
                  disabled={!replyBody.trim() || sending}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {sending ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-on-primary border-t-transparent" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-on-surface-variant">
            <MessageSquare className="h-12 w-12 opacity-20" />
            <p className="text-sm font-medium">Select a conversation</p>
            <p className="text-xs text-outline">Or start a new one with the + button</p>
          </div>
        )}
      </div>

      {/* ── Compose sheet ──────────────────────────────────── */}
      <InlineFormSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="New Message">
        <form onSubmit={handleSubmit(onCompose)} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-on-surface">To Branch</label>
            <select
              {...register('to_branch_id')}
              className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none"
            >
              <option value="">Select branch…</option>
              {otherBranches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {errors.to_branch_id && (
              <p className="mt-1 text-xs text-error">{errors.to_branch_id.message}</p>
            )}
          </div>
          <Input label="Subject" required error={errors.subject?.message} {...register('subject')} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-on-surface">Message</label>
            <textarea
              rows={4}
              className="w-full resize-none rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none"
              {...register('body')}
            />
            {errors.body && <p className="mt-1 text-xs text-error">{errors.body.message}</p>}
          </div>
          <Button type="submit" className="w-full" loading={isSubmitting}>Send Message</Button>
        </form>
      </InlineFormSheet>
    </div>
  )
}
