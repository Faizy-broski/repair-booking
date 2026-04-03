'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'

interface SignOutButtonProps {
  /** Where to redirect after sign-out. Defaults to '/login'. */
  redirectTo?: string
  className?: string
  iconClassName?: string
  label?: string
}

export function SignOutButton({
  redirectTo = '/login',
  className = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100',
  iconClassName = 'h-4 w-4',
  label = 'Sign Out',
}: SignOutButtonProps) {
  const router = useRouter()
  const clear = useAuthStore((s) => s.clear)
  const [loading, setLoading] = useState(false)

  async function handleSignOut() {
    setLoading(true)
    const supabase = createClient()
    // Signs out from Supabase AND clears the SSR cookie via the browser client
    await supabase.auth.signOut()
    // Clear Zustand persisted state so stale profile doesn't flash on next login
    clear()
    router.push(redirectTo)
    router.refresh()
  }

  return (
    <button onClick={handleSignOut} disabled={loading} className={className}>
      <LogOut className={iconClassName} />
      {label}
    </button>
  )
}
