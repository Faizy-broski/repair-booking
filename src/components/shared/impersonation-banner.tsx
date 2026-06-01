'use client'
import { useRouter } from 'next/navigation'
import { ShieldAlert, LogOut } from 'lucide-react'
import { useState } from 'react'

interface ImpersonationBannerProps {
  businessName: string
}

export function ImpersonationBanner({ businessName }: ImpersonationBannerProps) {
  const router = useRouter()
  const [exiting, setExiting] = useState(false)

  async function handleExit() {
    setExiting(true)
    window.location.href = '/api/auth/impersonate/exit'
  }

  return (
    <div className="sticky top-0 z-[100] flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-white shadow-md">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <span>
          Superadmin view — <strong>{businessName}</strong>. All actions affect real data.
        </span>
      </div>
      <button
        onClick={handleExit}
        disabled={exiting}
        className="flex items-center gap-1.5 rounded-md bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 transition-colors disabled:opacity-60"
      >
        <LogOut className="h-3.5 w-3.5" />
        {exiting ? 'Exiting…' : 'Exit Impersonation'}
      </button>
    </div>
  )
}
