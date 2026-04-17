'use client'
import { useState, useRef, useEffect } from 'react'
import { Bell, Menu, Search, ChevronDown, MessageSquare, ArrowRight, User, Settings, LogOut } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useMessageStore } from '@/store/message.store'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface TopbarProps {
  onMenuClick?: () => void
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const { profile, branches } = useAuthStore()
  const unreadCount       = useMessageStore((s) => s.unreadCount)
  const unreadMessages    = useMessageStore((s) => s.unreadMessages)
  const setPendingThreadId = useMessageStore((s) => s.setPendingThreadId)
  const router = useRouter()
  const initials = (profile?.full_name ?? 'U').charAt(0).toUpperCase()

  const [bellOpen, setBellOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  const [userOpen, setUserOpen] = useState(false)
  const userRef = useRef<HTMLDivElement>(null)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Close dropdowns on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (bellOpen && !bellRef.current?.contains(e.target as Node)) setBellOpen(false)
      if (userOpen && !userRef.current?.contains(e.target as Node)) setUserOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [bellOpen, userOpen])

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

      {/* Search */}
      <div className="flex flex-1 items-center gap-2.5 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 transition-colors focus-within:border-primary-fixed-dim focus-within:bg-surface-container-lowest focus-within:shadow-sm max-w-sm">
        <Search className="h-4 w-4 shrink-0 text-outline" />
        <input
          type="search"
          placeholder="Search tickets, customers, products..."
          className="flex-1 bg-transparent text-sm text-on-surface outline-none placeholder:text-outline"
        />
      </div>

      <div className="flex items-center gap-1.5 ml-auto">
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
