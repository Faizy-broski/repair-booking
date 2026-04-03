'use client'
import { useState, useEffect } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { useAuthStore } from '@/store/auth.store'
import { useModuleConfigStore } from '@/store/module-config.store'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Branch } from '@/types/database'

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const { setProfile, setBranches, setActiveBranch, setLoading, setCurrency, clear, profile: cachedProfile, activeBranch: storedActiveBranch } = useAuthStore()
  const { fetchConfigs, invalidate: invalidateConfigs } = useModuleConfigStore()

  useEffect(() => {
    async function loadSession() {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // If cached profile belongs to a different user, wipe stale data immediately
      if (cachedProfile && cachedProfile.id !== user.id) {
        clear()
        invalidateConfigs()
      }

      // Load profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      const profile = profileData as Profile | null
      if (!profile) return

      setProfile(profile)

      // Load business currency
      if (profile.business_id) {
        supabase
          .from('businesses')
          .select('currency')
          .eq('id', profile.business_id)
          .single()
          .then(({ data }) => { if (data?.currency) setCurrency(data.currency) })
      }

      // Load branches for this business
      if (profile.business_id) {
        const { data: branchData } = await supabase
          .from('branches')
          .select('*')
          .eq('business_id', profile.business_id)
          .eq('is_active', true)
          .order('is_main', { ascending: false })

        const branches = branchData as Branch[] | null

        if (branches && branchData) {
          setBranches(branches)

          // If staff, set their specific branch; if owner, default to main branch
          let resolvedBranch: Branch | null = null
          if (profile.branch_id) {
            resolvedBranch = branches.find((b) => b.id === profile.branch_id) ?? null
            if (resolvedBranch) setActiveBranch(resolvedBranch)
          } else if (branches.length > 0) {
            // Owner: keep their previously selected branch if still valid, else default to main
            const preferred = storedActiveBranch
              ? branches.find((b) => b.id === storedActiveBranch.id) ?? branches[0]
              : branches[0]
            resolvedBranch = preferred
            setActiveBranch(resolvedBranch)
          }

          // Refresh module configs in background (won't flash if already cached)
          if (resolvedBranch) {
            fetchConfigs(resolvedBranch.id)
          }
        }
      }

      setLoading(false)
    }

    loadSession()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar collapsed={collapsed} />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-50">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
