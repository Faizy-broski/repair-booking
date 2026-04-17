'use client'
import { useState, useEffect } from 'react'
import { Wrench, Menu, X } from 'lucide-react'
import { SignOutButton } from '@/components/layout/sign-out-button'
import { SuperAdminNav } from './nav'

function Sidebar({ onClose }: { onClose?: () => void }) {
  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col bg-sidebar-bg text-white">
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-teal shadow-lg shadow-brand-teal/30">
          <Wrench className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold tracking-tight text-white">SuperAdmin</p>
          <p className="text-[10px] text-white/40 tracking-wide uppercase">Platform Control</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <SuperAdminNav onNavClick={onClose} />
      <div className="border-t border-white/10 p-2">
        <SignOutButton redirectTo="/login" />
      </div>
    </aside>
  )
}

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  return (
    <div className="flex h-screen overflow-hidden bg-surface-container-low">
      {/* Desktop sidebar — always visible */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative flex-shrink-0 animate-slide-in-left">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile topbar */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-outline-variant bg-sidebar-bg px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-teal">
              <Wrench className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-bold text-white">SuperAdmin</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
