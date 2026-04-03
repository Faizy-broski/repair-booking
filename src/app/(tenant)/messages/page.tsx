'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Send, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { useAuthStore } from '@/store/auth.store'
import { formatDateTime } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import { createBrowserClient } from '@supabase/ssr'

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
  profiles?: { full_name: string | null } | null
}

const schema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Message is required'),
  to_branch_id: z.string().uuid('Please select a branch'),
})

type FormData = z.infer<typeof schema>

export default function MessagesPage() {
  const { activeBranch, branches, profile } = useAuthStore()
  const branchName = (id: string | null | undefined) =>
    branches.find((b) => b.id === id)?.name ?? 'Unknown'
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [selected, setSelected] = useState<MessageRow | null>(null)
  const [thread, setThread] = useState<MessageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const fetchMessages = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    const res = await fetch(`/api/messages?branch_id=${activeBranch.id}`)
    const json = await res.json()
    setMessages(json.data ?? [])
    setLoading(false)
  }, [activeBranch])

  const fetchThread = useCallback(async (messageId: string) => {
    const res = await fetch(`/api/messages/${messageId}`)
    const json = await res.json()
    setThread(json.data ?? [])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [])

  useEffect(() => { fetchMessages() }, [fetchMessages])

  // Realtime subscription
  useEffect(() => {
    if (!activeBranch) return
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const channel = supabase
      .channel('messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `to_branch_id=eq.${activeBranch.id}`,
      }, () => {
        fetchMessages()
        if (selected) fetchThread(selected.id)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeBranch, selected, fetchMessages, fetchThread])

  async function onSelectMessage(msg: MessageRow) {
    setSelected(msg)
    fetchThread(msg.parent_id ?? msg.id)
    // mark read
    if (!msg.is_read) {
      await fetch(`/api/messages/${msg.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_read: true }) })
      fetchMessages()
    }
  }

  async function onReply() {
    if (!replyBody.trim() || !selected || !activeBranch) return
    setSending(true)
    const isFromMe = selected.from_branch_id === activeBranch.id

    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_branch_id: activeBranch.id,
        to_branch_id: isFromMe ? selected.to_branch_id : selected.from_branch_id,
        subject: selected.subject,
        body: replyBody,
        parent_id: selected.parent_id ?? selected.id,
      }),
    })
    setReplyBody('')
    setSending(false)
    fetchThread(selected.parent_id ?? selected.id)
  }

  async function onCompose(data: FormData) {
    if (!activeBranch) return
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, from_branch_id: activeBranch.id }),
    })
    if (res.ok) { reset(); setSheetOpen(false); fetchMessages() }
  }

  const otherBranches = branches.filter((b) => b.id !== activeBranch?.id)

  return (
    <div className="flex h-[calc(100vh-3.5rem)] gap-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* Message list */}
      <div className="flex w-72 shrink-0 flex-col border-r border-gray-200">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h1 className="font-semibold text-gray-900">Messages</h1>
          <Button size="sm" onClick={() => setSheetOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse border-b border-gray-100 p-3">
                <div className="h-3 w-2/3 rounded bg-gray-100" />
              </div>
            ))
          ) : messages.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-gray-400">No messages</div>
          ) : (
            messages.map((msg) => (
              <button
                key={msg.id}
                onClick={() => onSelectMessage(msg)}
                className={`w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                  selected?.id === msg.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={`truncate text-sm ${msg.is_read ? 'text-gray-600' : 'font-semibold text-gray-900'}`}>
                    {msg.subject || '(no subject)'}
                  </p>
                  {!msg.is_read && <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-400">
                  {branchName(msg.from_branch_id)} → {branchName(msg.to_branch_id)}
                </p>
                <p className="mt-0.5 text-xs text-gray-400">{formatDateTime(msg.created_at)}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Thread view */}
      <div className="flex flex-1 flex-col">
        {selected ? (
          <>
            <div className="border-b border-gray-200 px-6 py-3">
              <h2 className="font-semibold text-gray-900">{selected.subject || '(no subject)'}</h2>
              <p className="text-xs text-gray-400">
                {branchName(selected.from_branch_id)} → {branchName(selected.to_branch_id)}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {thread.map((msg) => {
                const isMine = msg.sender_id === profile?.id
                return (
                  <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-xl px-4 py-2.5 ${
                      isMine ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
                    }`}>
                      <p className="text-sm">{msg.body}</p>
                      <p className={`mt-1 text-xs ${isMine ? 'text-blue-200' : 'text-gray-400'}`}>
                        {msg.profiles?.full_name ?? 'Unknown'} · {formatDateTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
            <div className="border-t border-gray-200 px-4 py-3">
              <div className="flex gap-2">
                <input
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onReply() } }}
                  placeholder="Type a reply..."
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                <Button size="sm" onClick={onReply} loading={sending} disabled={!replyBody.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
            Select a message to read
          </div>
        )}
      </div>

      {/* Compose sheet */}
      <InlineFormSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="New Message">
        <form onSubmit={handleSubmit(onCompose)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">To Branch</label>
            <select
              {...register('to_branch_id')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select branch...</option>
              {otherBranches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {errors.to_branch_id && <p className="mt-1 text-xs text-red-500">{errors.to_branch_id.message}</p>}
          </div>
          <Input label="Subject" required error={errors.subject?.message} {...register('subject')} />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Message</label>
            <textarea
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              {...register('body')}
            />
            {errors.body && <p className="mt-1 text-xs text-red-500">{errors.body.message}</p>}
          </div>
          <Button type="submit" className="w-full" loading={isSubmitting}>Send Message</Button>
        </form>
      </InlineFormSheet>
    </div>
  )
}
