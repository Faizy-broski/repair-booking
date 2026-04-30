'use client'
import { AlertTriangle, Wrench, X } from 'lucide-react'
import { useBroadcastsStore } from '@/store/broadcasts.store'
import type { SystemBroadcast } from '@/backend/services/broadcast.service'

const CONFIG = {
  downtime:    { bg: 'bg-red-600',    text: 'text-white',       icon: AlertTriangle, label: 'DOWNTIME' },
  maintenance: { bg: 'bg-amber-500',  text: 'text-amber-950',   icon: Wrench,        label: 'MAINTENANCE' },
} as const

export function BroadcastBanner() {
  const banner = useBroadcastsStore((s) => s.bannerBroadcast)
  const markRead = useBroadcastsStore((s) => s.markRead)

  if (!banner) return null

  const cfg = CONFIG[banner.type as keyof typeof CONFIG]
  const Icon = cfg.icon

  async function dismiss() {
    markRead(banner!.id)
    // Fire-and-forget — persist the read even if the user navigates away
    fetch(`/api/broadcasts/${banner!.id}/read`, { method: 'POST' }).catch(() => {})
  }

  return (
    <div className={`${cfg.bg} ${cfg.text} shrink-0 px-4 py-2.5`} role="alert">
      <div className="flex items-start gap-3 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="text-xs font-black uppercase tracking-widest opacity-80 shrink-0">
            {cfg.label}
          </span>
          <span className="mx-1 opacity-40">·</span>
          <span className="text-sm font-semibold truncate">{banner.title}</span>
          <span className="mx-1 opacity-40 hidden sm:inline">—</span>
          <span className="text-sm opacity-90 hidden sm:inline line-clamp-1">{banner.body}</span>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {/* Body on mobile (below the title row) */}
      <p className="text-sm opacity-90 mt-1 sm:hidden line-clamp-2 pl-6">{banner.body}</p>
    </div>
  )
}
