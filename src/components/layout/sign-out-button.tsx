'use client'
import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { performSignOut } from '@/lib/sign-out'

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
  const [loading, setLoading] = useState(false)

  async function handleSignOut() {
    setLoading(true)
    await performSignOut(redirectTo)
  }

  return (
    <button onClick={handleSignOut} disabled={loading} className={className}>
      <LogOut className={iconClassName} />
      {label}
    </button>
  )
}
