'use client'
import { useState, useEffect } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { NotificationToasts } from '@/components/layout/notification-toasts'
import { MessageBadge } from '@/components/layout/message-badge'
import { TourGuide } from '@/components/shared/tour-guide'
import { useAuthStore } from '@/store/auth.store'
import { useModuleConfigStore } from '@/store/module-config.store'
import { createClient } from '@/lib/supabase/client'
import { getSubdomain } from '@/lib/utils'
import { Toaster } from 'sonner'
import type { Profile, Branch } from '@/types/database'
import type { SubscriptionStatus } from '@/store/auth.store'
import Providers from '@/components/providers'

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  // Gates the protected layout render.
  const [sessionVerified, setSessionVerified] = useState(false)

  const {
    setProfile, setBranches, setActiveBranch, setLoading,
    setCurrency, setSubscriptionStatus, clear,
    profile: cachedProfile,
  } = useAuthStore()
  const { fetchConfigs, invalidate: invalidateConfigs } = useModuleConfigStore()

  useEffect(() => {
    async function loadSession() {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        clear()
        window.location.replace('/login')
        return
      }

      setSessionVerified(true)

      const urlParams = new URLSearchParams(window.location.search)
      if (urlParams.get('upgraded') === '1') {
        const sessionId = urlParams.get('session_id')
        window.history.replaceState({}, '', window.location.pathname)
        if (sessionId) {
          try {
            await fetch('/api/stripe/verify-upgrade', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId }),
            })
          } catch { }
        }
        invalidateConfigs()
      }

      if (cachedProfile && cachedProfile.id !== user.id) {
        clear()
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      const profile = profileData as Profile | null
      if (!profile) return

      const subdomain = getSubdomain(window.location.hostname)
      if (subdomain && profile.business_id) {
        const { data: subBiz, error: bizError } = await supabase
          .from('businesses')
          .select('id')
          .eq('subdomain', subdomain)
          .maybeSingle()

        if (!bizError && subBiz && subBiz.id !== profile.business_id) {
          await supabase.auth.signOut({ scope: 'local' })
          clear()
          window.location.replace('/login?error=wrong_tenant')
          return
        }
      }

      setProfile(profile)

      if (profile.business_id) {
        supabase
          .from('businesses')
          .select('currency')
          .eq('id', profile.business_id)
          .single()
          .then(({ data }) => { if (data?.currency) setCurrency(data.currency) })
      }

      if (profile.business_id) {
        const { data: branchData } = await supabase
          .from('branches')
          .select('*')
          .eq('business_id', profile.business_id)
          .eq('is_active', true)
          .order('is_main', { ascending: false })

        const branches = branchData as Branch[] | null

        if (branches?.length) {
          setBranches(branches)
          const persistedActiveBranch = useAuthStore.getState().activeBranch
          let resolvedBranch: Branch | null = null
          if (profile.branch_id) {
            resolvedBranch = branches.find((b) => b.id === profile.branch_id) ?? null
          } else {
            resolvedBranch = persistedActiveBranch
              ? branches.find((b) => b.id === persistedActiveBranch.id) ?? branches[0]
              : branches[0]
          }

          if (resolvedBranch) {
            if (resolvedBranch.id !== persistedActiveBranch?.id) {
              setActiveBranch(resolvedBranch)
            }
          }

          if (resolvedBranch) {
            fetchConfigs(resolvedBranch.id)
          }
        }
      }

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

  if (!sessionVerified) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-container-low">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-teal border-t-transparent" />
      </div>
    )
  }

  return (
    <Providers>
      <div className="flex h-screen overflow-hidden bg-surface-container-low">
        <div className="hidden lg:flex">
          <Sidebar collapsed={collapsed} />
        </div>

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

        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>

        <NotificationToasts />
        <MessageBadge />
        <TourGuide />
        <Toaster richColors position="top-center" />
      </div>
    </Providers>
  )
}
