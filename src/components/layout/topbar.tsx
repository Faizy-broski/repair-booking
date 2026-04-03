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
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-100 bg-white px-4 shadow-sm">
      {/* Mobile menu toggle */}
      <button
        onClick={onMenuClick}
        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Search */}
      <div className="flex flex-1 items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 transition-colors focus-within:border-blue-300 focus-within:bg-white focus-within:shadow-sm max-w-sm">
        <Search className="h-4 w-4 shrink-0 text-gray-400" />
        <input
          type="search"
          placeholder="Search tickets, customers, products..."
          className="flex-1 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
        />
      </div>

      <div className="flex items-center gap-1.5 ml-auto">
        {/* Notifications */}
        <button className="relative rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
          <Bell className="h-4.5 w-4.5" style={{ width: '1.125rem', height: '1.125rem' }} />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500 ring-2 ring-white" />
        </button>

        {/* Divider */}
        <div className="mx-1 h-5 w-px bg-gray-200" />

        {/* User pill */}
        <button className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 transition-colors hover:bg-gray-100">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-xs font-bold text-white shadow-sm shadow-blue-500/30">
            {initials}
          </div>
          {profile?.full_name && (
            <span className="hidden text-sm font-medium text-gray-700 sm:block max-w-[120px] truncate">
              {profile.full_name}
            </span>
          )}
          <ChevronDown className="hidden h-3.5 w-3.5 text-gray-400 sm:block" />
        </button>
      </div>
    </header>
  )
}
