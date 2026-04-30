'use client'
import { useState, useRef, useEffect } from 'react'
import { Bell, Menu, ChevronDown, MessageSquare, ArrowRight, User, Settings, LogOut, Megaphone, Info, AlertTriangle, Wrench, X } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useMessageStore } from '@/store/message.store'
import { useBroadcastsStore } from '@/store/broadcasts.store'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { queryClient } from '@/lib/query-client'
import type { SystemBroadcast } from '@/backend/services/broadcast.service'

interface TopbarProps {
  onMenuClick?: () => void
}

const BROADCAST_ICON = {
  info:        { icon: Info,          cls: 'text-blue-500' },
  warning:     { icon: AlertTriangle, cls: 'text-amber-500' },
  downtime:    { icon: AlertTriangle, cls: 'text-red-500' },
  maintenance: { icon: Wrench,        cls: 'text-amber-500' },
} as const

export function Topbar({ onMenuClick }: TopbarProps) {
  const { profile, branches, clear: clearAuthStore } = useAuthStore()
  const unreadCount = useMessageStore((s) => s.unreadCount)
  const unreadMessages = useMessageStore((s) => s.unreadMessages)
  const setPendingThreadId = useMessageStore((s) => s.setPendingThreadId)
  const broadcastUnreadCount = useBroadcastsStore((s) => s.unreadCount)
  const unreadBroadcasts = useBroadcastsStore((s) => s.unreadList)
  const markBroadcastRead = useBroadcastsStore((s) => s.markRead)
  const router = useRouter()
  const initials = (profile?.full_name ?? 'U').charAt(0).toUpperCase()

  const [bellOpen, setBellOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  const [announceOpen, setAnnounceOpen] = useState(false)
  const announceRef = useRef<HTMLDivElement>(null)

  const [userOpen, setUserOpen] = useState(false)
  const userRef = useRef<HTMLDivElement>(null)

  async function dismissBroadcast(b: SystemBroadcast) {
    markBroadcastRead(b.id)
    fetch(`/api/broadcasts/${b.id}/read`, { method: 'POST' }).catch(() => {})
  }

  async function handleSignOut() {
    // Clear local store immediately so stale profile/branch don't flash
    clearAuthStore()
    queryClient.clear()
    const supabase = createClient()
    // scope: 'global' revokes the refresh token server-side, so the session can't
    // be reused even if the shared .repairbooking.co.uk cookie isn't cleared by the browser
    await supabase.auth.signOut({ scope: 'global' })
    // Full-page navigation to the ROOT domain login — not router.push (which would
    // stay on this subdomain and risk re-using the stale shared cookie)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    window.location.href = appUrl ? `${appUrl}/login` : '/login'
  }

  // Close dropdowns on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (bellOpen && !bellRef.current?.contains(e.target as Node)) setBellOpen(false)
      if (announceOpen && !announceRef.current?.contains(e.target as Node)) setAnnounceOpen(false)
      if (userOpen && !userRef.current?.contains(e.target as Node)) setUserOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [bellOpen, announceOpen, userOpen])

  // Resolve branch name from the branches store (realtime payloads don't carry joins)
  function resolveBranchName(msg: { from_branch_name: string | null; from_branch_id: string | null }) {
    if (msg.from_branch_name) return msg.from_branch_name
    if (!msg.from_branch_id) return null
    return branches.find((b) => b.id === msg.from_branch_id)?.name ?? null
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 shadow-sm">
      {/* Mobile menu toggle */}
      <button
        onClick={onMenuClick}
        className="rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Search placeholder */}
      <div className="flex-1" />

      <div className="flex items-center gap-2 ml-auto">
        <Link
          href="/repairs?new=true"
          className="relative hidden items-center justify-center overflow-hidden rounded-xl p-[1.5px] transition-all hover:scale-[1.02] active:scale-95 sm:flex shadow-[0_0_20px_-5px_var(--primary)]"
        >
          {/* Rotating gradient background using high-contrast brand colors */}
          <span className="absolute inset-[-1000%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,var(--on-primary)_0%,var(--primary-fixed)_50%,var(--on-primary)_100%)]" />

          {/* Inner button content using brand teal instead of black */}
          <span className="relative flex items-center gap-2 rounded-[11px] bg-primary px-6 py-2.5 text-[12px] font-extrabold uppercase tracking-widest text-on-primary backdrop-blur-3xl">

            Book a Repair
          </span>
        </Link>

        {/* ── System Announcements (Megaphone) ── */}
        <div ref={announceRef} className="relative">
          <button
            onClick={() => { setAnnounceOpen((v) => !v); setBellOpen(false) }}
            className="relative rounded-xl p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
            aria-label={broadcastUnreadCount > 0 ? `${broadcastUnreadCount} system announcements` : 'System announcements'}
          >
            <Megaphone style={{ width: '1.125rem', height: '1.125rem' }} />
            {broadcastUnreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-0.5 text-[10px] font-bold leading-none text-white ring-2 ring-surface-container-lowest">
                {broadcastUnreadCount > 9 ? '9+' : broadcastUnreadCount}
              </span>
            )}
          </button>

          {announceOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-96 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-xl">
              <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
                <h3 className="text-sm font-semibold text-on-surface">System Announcements</h3>
                {broadcastUnreadCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    {broadcastUnreadCount} unread
                  </span>
                )}
              </div>

              <div className="max-h-[420px] overflow-y-auto divide-y divide-outline-variant">
                {unreadBroadcasts.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-on-surface-variant">
                    <Megaphone className="h-6 w-6 opacity-30" />
                    <p className="text-sm">No announcements</p>
                  </div>
                ) : (
                  unreadBroadcasts.map((b) => {
                    const meta = BROADCAST_ICON[b.type as keyof typeof BROADCAST_ICON] ?? BROADCAST_ICON.info
                    const Icon = meta.icon
                    return (
                      <div key={b.id} className="flex gap-3 px-4 py-3">
                        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.cls}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-on-surface leading-snug">{b.title}</p>
                            <button
                              onClick={() => dismissBroadcast(b)}
                              className="shrink-0 rounded p-0.5 text-outline hover:text-on-surface transition-colors"
                              aria-label="Dismiss"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="text-xs text-on-surface-variant mt-0.5 whitespace-pre-wrap">{b.body}</p>
                          <p className="text-[10px] text-outline mt-1">{formatDateTime(b.created_at)}</p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Bell / Messages dropdown ── */}
        <div ref={bellRef} className="relative">
          <button
            onClick={() => setBellOpen((v) => !v)}
            className="relative rounded-xl p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
            aria-label={unreadCount > 0 ? `${unreadCount} unread messages` : 'Messages'}
          >
            <Bell style={{ width: '1.125rem', height: '1.125rem' }} />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-error px-0.5 text-[10px] font-bold leading-none text-on-error ring-2 ring-surface-container-lowest">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
                <h3 className="text-sm font-semibold text-on-surface">Messages</h3>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-error/10 px-2 py-0.5 text-xs font-medium text-error">
                    {unreadCount} unread
                  </span>
                )}
              </div>

              {/* Message list */}
              <div className="max-h-72 overflow-y-auto">
                {unreadMessages.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-on-surface-variant">
                    <MessageSquare className="h-6 w-6 opacity-30" />
                    <p className="text-sm">No unread messages</p>
                  </div>
                ) : (
                  unreadMessages.map((msg) => {
                    const fromName = resolveBranchName(msg)
                    return (
                      <button
                        key={msg.id}
                        onClick={() => {
                          setBellOpen(false)
                          setPendingThreadId(msg.id)
                          router.push('/messages')
                        }}
                        className="flex w-full flex-col gap-0.5 border-b border-outline-variant px-4 py-3 text-left transition-colors hover:bg-surface-container-low last:border-b-0"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-on-surface">
                            {msg.subject || '(no subject)'}
                          </p>
                          <span className="shrink-0 text-[11px] text-on-surface-variant">
                            {formatDateTime(msg.created_at)}
                          </span>
                        </div>
                        {fromName && (
                          <p className="text-xs font-medium text-primary">{fromName}</p>
                        )}
                        <p className="line-clamp-1 text-xs text-on-surface-variant">{msg.body}</p>
                      </button>
                    )
                  })
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-outline-variant px-4 py-2.5">
                <Link
                  href="/messages"
                  onClick={() => setBellOpen(false)}
                  className="flex items-center justify-between text-sm font-medium text-primary hover:underline"
                >
                  View all messages
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="mx-1 h-5 w-px bg-outline-variant" />

        {/* User pill + dropdown */}
        <div ref={userRef} className="relative">
          <button
            onClick={() => setUserOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 transition-colors hover:bg-surface-container-low"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dim text-xs font-bold text-on-primary shadow-sm shadow-primary/30">
              {initials}
            </div>
            {profile?.full_name && (
              <span className="hidden text-sm font-medium text-on-surface sm:block max-w-[120px] truncate">
                {profile.full_name}
              </span>
            )}
            <ChevronDown className={`hidden h-3.5 w-3.5 text-outline sm:block transition-transform ${userOpen ? 'rotate-180' : ''}`} />
          </button>

          {userOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-xl py-1">
              <Link
                href="/account"
                onClick={() => setUserOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-on-surface hover:bg-surface-container-low transition-colors"
              >
                <User className="h-4 w-4 text-outline" />
                Account
              </Link>
              <Link
                href="/settings"
                onClick={() => setUserOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-on-surface hover:bg-surface-container-low transition-colors"
              >
                <Settings className="h-4 w-4 text-outline" />
                Settings
              </Link>
              <div className="my-1 h-px bg-outline-variant mx-2" />
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-error hover:bg-error/5 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
