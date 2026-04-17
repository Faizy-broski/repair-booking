import { redirect } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { AccessDenied } from './access-denied'
import { SuperAdminShell } from './shell'

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

  return <SuperAdminShell>{children}</SuperAdminShell>
}
