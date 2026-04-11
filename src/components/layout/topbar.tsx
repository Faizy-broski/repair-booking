'use client'
import { Bell, Menu, Search, ChevronDown } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'

interface TopbarProps {
  onMenuClick?: () => void
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const { profile } = useAuthStore()
  const initials = (profile?.full_name ?? 'U').charAt(0).toUpperCase()

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
        {/* Notifications */}
        <button className="relative rounded-xl p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface">
          <Bell className="h-4.5 w-4.5" style={{ width: '1.125rem', height: '1.125rem' }} />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-error ring-2 ring-surface-container-lowest" />
        </button>

        {/* Divider */}
        <div className="mx-1 h-5 w-px bg-outline-variant" />

        {/* User pill */}
        <button className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 transition-colors hover:bg-surface-container-low">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-dim text-xs font-bold text-on-primary shadow-sm shadow-primary/30">
            {initials}
          </div>
          {profile?.full_name && (
            <span className="hidden text-sm font-medium text-on-surface sm:block max-w-[120px] truncate">
              {profile.full_name}
            </span>
          )}
          <ChevronDown className="hidden h-3.5 w-3.5 text-outline sm:block" />
        </button>
      </div>
    </header>
  )
}
