import { redirect } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/layout/sign-out-button'
import { AccessDenied } from './access-denied'
import { SuperAdminNav } from './nav'
import { Wrench } from 'lucide-react'

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Verify super_admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // Authenticated but wrong role — show access-denied instead of silently
  // redirecting to /login, which would just loop or confuse the user.
  if (profile?.role !== 'super_admin') {
    return <AccessDenied email={user.email ?? ''} />
  }

  return (
    <div className="flex h-screen bg-surface-container-low">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col bg-sidebar-bg text-white">
        {/* Brand */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-teal shadow-lg shadow-brand-teal/30">
            <Wrench className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold tracking-tight text-white">SuperAdmin</p>
            <p className="text-[10px] text-white/40 tracking-wide uppercase">Platform Control</p>
          </div>
        </div>
        <SuperAdminNav />
        <div className="border-t border-white/10 p-2">
          <SignOutButton redirectTo="/login" />
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  )
}
