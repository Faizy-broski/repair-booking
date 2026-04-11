'use client'
import { useState, useEffect } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { useAuthStore } from '@/store/auth.store'
import { useModuleConfigStore } from '@/store/module-config.store'
import { createClient } from '@/lib/supabase/client'
import { getSubdomain } from '@/lib/utils'
import type { Profile, Branch } from '@/types/database'
import type { SubscriptionStatus } from '@/store/auth.store'

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const { setProfile, setBranches, setActiveBranch, setLoading, setCurrency, setSubscriptionStatus, clear, profile: cachedProfile, activeBranch: storedActiveBranch } = useAuthStore()
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

      // ── Cross-tenant guard (defence-in-depth) ────────────────────────
      // Verify the loaded profile belongs to the current subdomain's
      // business.  Catches edge cases where middleware was bypassed
      // (client-side nav, cached pages, etc.).
      // Uses .maybeSingle() to avoid 406 errors when RLS hides the row.
      // Only enforces when we *positively* find a mismatched business.
      const subdomain = getSubdomain(window.location.hostname)
      if (subdomain && profile.business_id) {
        const { data: subBiz, error: bizError } = await supabase
          .from('businesses')
          .select('id')
          .eq('subdomain', subdomain)
          .maybeSingle()

        if (!bizError && subBiz && subBiz.id !== profile.business_id) {
          await supabase.auth.signOut()
          clear()
          invalidateConfigs()
          window.location.replace('/login?error=wrong_tenant')
          return
        }
      }

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

      // Load subscription status
      if (profile.business_id) {
        supabase
          .from('subscriptions')
          .select('status, trial_ends_at, current_period_end, plans(name, plan_type)')
          .eq('business_id', profile.business_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data: sub }) => {
            const plans = sub?.plans as { name?: string; plan_type?: string } | null
            const planType = (plans?.plan_type ?? null) as SubscriptionStatus['planType']
            const planName = plans?.name ?? null
            const trialEndsAt = sub?.trial_ends_at ?? null
            const freeTrialExpired = planType === 'free' && trialEndsAt && new Date(trialEndsAt) < new Date()
            const paidSubInactive = planType === 'paid' && sub?.status && !['active', 'trialing'].includes(sub.status)
            setSubscriptionStatus({
              status: sub?.status ?? null,
              planType,
              planName,
              trialEndsAt,
              currentPeriodEnd: (sub as any)?.current_period_end ?? null,
              hasAccess: !freeTrialExpired && !paidSubInactive,
            })
          })
      }

      setLoading(false)
    }

    loadSession()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-surface-container-low">
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
