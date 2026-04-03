import { redirect } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/layout/sign-out-button'
import { AccessDenied } from './access-denied'
import { SuperAdminNav } from './nav'

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
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-14 items-center border-b border-gray-200 px-4">
          <span className="font-bold text-gray-900">SuperAdmin</span>
          <span className="ml-1.5 rounded-md bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
            Admin
          </span>
        </div>
        <SuperAdminNav />
        <div className="border-t border-gray-200 p-2">
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
