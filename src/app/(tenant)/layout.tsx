'use client'
import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { NotificationToasts } from '@/components/layout/notification-toasts'
import { MessageBadge } from '@/components/layout/message-badge'
import { BroadcastBanner } from '@/components/layout/broadcast-banner'
import { TourGuide } from '@/components/shared/tour-guide'
import { ImpersonationBanner } from '@/components/shared/impersonation-banner'
import { useAuthStore } from '@/store/auth.store'
import { useModuleConfigStore } from '@/store/module-config.store'
import { useBroadcastsStore } from '@/store/broadcasts.store'
import { useRealtime } from '@/hooks/use-realtime'
import { createClient } from '@/lib/supabase/client'
import { getSubdomain } from '@/lib/utils'
import { Toaster } from 'sonner'
import type { Profile, Branch } from '@/types/database'
import type { SubscriptionStatus } from '@/store/auth.store'
import type { SystemBroadcast } from '@/backend/services/broadcast.service'
import Providers from '@/components/providers'

function getImpersonationBusinessName(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)sb-imp-ui=([^;]*)/)
  return match ? match[1] : null
}

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [impersonatingBusiness, setImpersonatingBusiness] = useState<string | null>(null)

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  // Gates the protected layout render.
  const [sessionVerified, setSessionVerified] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  const {
    setProfile, setBranches, setActiveBranch, setLoading,
    setCurrency, setSubscriptionStatus, clear,
    profile: cachedProfile,
  } = useAuthStore()
  const { fetchConfigs, invalidate: invalidateConfigs } = useModuleConfigStore()
  const { setLoaded: setBroadcastsLoaded, addBroadcast, syncBroadcast, reset: resetBroadcasts } = useBroadcastsStore()
  const broadcastsBusinessId = useAuthStore((s) => s.profile?.business_id ?? '')

  // Load broadcasts once profile+business is available
  useEffect(() => {
    if (!broadcastsBusinessId) return
    fetch('/api/broadcasts')
      .then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (j?.data) setBroadcastsLoaded(j.data.broadcasts ?? [], j.data.readIds ?? [])
      })
      .catch(() => {})
  }, [broadcastsBusinessId, setBroadcastsLoaded])

  // Realtime: super-admin publishes → UPDATE event fires on system_broadcasts
  // No filterColumn — subscribe to all changes; RLS blocks drafts/archived at DB level.
  // Both INSERT (new active broadcast) and UPDATE (draft→active, active→archived) handled.
  useRealtime<SystemBroadcast & Record<string, unknown>>({
    table: 'system_broadcasts',
    onInsert: (b) => addBroadcast(b as unknown as SystemBroadcast, broadcastsBusinessId),
    onUpdate: (b) => syncBroadcast(b as unknown as SystemBroadcast, broadcastsBusinessId),
  })

  useEffect(() => {
    async function loadSession() {
      // 1. Manually rehydrate the store using the subdomain-scoped key
      await useAuthStore.persist.rehydrate()
      setIsHydrated(true)

      // ── Impersonation mode ────────────────────────────────────────────────
      // If the sb-imp-ui cookie is present, the superadmin is viewing this
      // business dashboard. Skip the real Supabase session check (which would
      // fail since no owner session is in the shared sb-* cookie) and fetch
      // the profile via API (all API routes use the server-side impersonation context).
      const impBusiness = getImpersonationBusinessName()
      if (impBusiness) {
        setImpersonatingBusiness(impBusiness)
        const res = await fetch('/api/account/profile').catch(() => null)
        if (res?.ok) {
          const json = await res.json()
          const profile = json.data as Profile | null
          if (profile) {
            setProfile(profile)
            if (profile.business_id) {
              const branchRes = await fetch('/api/settings/branches').catch(() => null)
              if (branchRes?.ok) {
                const branchJson = await branchRes.json()
                const branches = branchJson.data as Branch[] | null
                if (branches?.length) {
                  setBranches(branches)
                  const main = branches.find((b) => b.is_main) ?? branches[0]
                  setActiveBranch(main)
                  fetchConfigs(main.id)
                }
              }
            }
          }
        }
        setSessionVerified(true)
        setLoading(false)
        return
      }

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

      // 2. Clear stale state synchronously if there's a user mismatch
      const currentProfile = useAuthStore.getState().profile
      if (currentProfile && currentProfile.id !== user.id) {
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

      // Non-critical: fire in background, don't block setLoading
      if (profile.business_id) {
        supabase
          .from('businesses')
          .select('currency')
          .eq('id', profile.business_id)
          .single()
          .then(({ data }) => { if (data?.currency) setCurrency(data.currency) })

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

      setLoading(false)
    }

    loadSession()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!isHydrated || !sessionVerified) {
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
          {impersonatingBusiness && <ImpersonationBanner businessName={impersonatingBusiness} />}
          <Topbar onMenuClick={() => setSidebarOpen(true)} />
          <BroadcastBanner />
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
