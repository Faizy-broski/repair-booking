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

  // Gates the protected layout render.
  // Set to true as soon as Supabase confirms a live session (~100ms JWT check).
  // Everything else (profile, branches, configs, subscription) loads in background
  // and populates the persisted stores — sidebar and pages update automatically.
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

      // ── Step 1: Verify live session ──────────────────────────────────────
      // getUser() validates the JWT against Supabase Auth.
      // For valid, non-expired tokens this is a local decode (~0ms).
      // For expired tokens it refreshes via the network (~200ms).
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        // No session — wipe auth store data and redirect.
        // This is the Back-after-logout guard: cached page renders → useEffect
        // fires → getUser() returns null → immediate redirect to login.
        // We intentionally do NOT call invalidateConfigs() here so that the
        // persisted module config cache survives for the next login — avoiding
        // sidebar skeletons when the same user (or any user) logs in again.
        clear()
        window.location.replace('/login')
        return
      }

      // ── Session confirmed ────────────────────────────────────────────────
      // Unlock the layout immediately so the user sees the UI with whatever
      // is already in the persisted stores (profile, branches, configs).
      // All remaining DB queries run in the background and update stores
      // reactively — no additional loading states are imposed.
      setSessionVerified(true)

      // ── Post-upgrade: verify Stripe session and update subscription ──────
      // When Stripe redirects back with ?upgraded=1&session_id=cs_xxx, call
      // the verify endpoint BEFORE fetching subscription/module configs so
      // the DB is updated first and we get the fresh plan data immediately.
      const urlParams = new URLSearchParams(window.location.search)
      if (urlParams.get('upgraded') === '1') {
        const sessionId = urlParams.get('session_id')
        // Clean URL immediately regardless of outcome
        window.history.replaceState({}, '', window.location.pathname)
        if (sessionId) {
          try {
            await fetch('/api/stripe/verify-upgrade', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId }),
            })
          } catch { /* non-fatal — subscription data will just come from webhook later */ }
        }
        // Always bust the module config cache so new modules show immediately
        invalidateConfigs()
      }

      // ── Step 2: Load profile (background) ───────────────────────────────
      if (cachedProfile && cachedProfile.id !== user.id) {
        // Different user logged in on same device — wipe auth store but keep
        // the config cache (TTL + branchId check in fetchConfigs will refresh it)
        clear()
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      const profile = profileData as Profile | null
      if (!profile) return

      // ── Step 3: Cross-tenant guard (defence-in-depth) ───────────────────
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
          window.location.replace('/login?error=wrong_tenant')
          return
        }
      }

      setProfile(profile)

      // ── Step 4: Business currency (fire-and-forget) ──────────────────────
      if (profile.business_id) {
        supabase
          .from('businesses')
          .select('currency')
          .eq('id', profile.business_id)
          .single()
          .then(({ data }) => { if (data?.currency) setCurrency(data.currency) })
      }

      // ── Step 5: Branches ─────────────────────────────────────────────────
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

          // Read activeBranch from the live store state here (NOT from the
          // useEffect closure). The closure is created during React's SSR
          // hydration reconciliation pass where localStorage hasn't applied yet,
          // so the closed-over value would be null and always fall back to
          // branches[0] (the main branch), silently reverting the user's
          // branch selection on every reload.
          // Reading via getState() happens AFTER Zustand's synchronous
          // localStorage hydration, so it correctly reflects the persisted choice.
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

          // fetchConfigs uses TTL-based cache: if the same branch's data is
          // fresh (< 5 min) it returns immediately without hitting the network.
          if (resolvedBranch) {
            fetchConfigs(resolvedBranch.id)
          }
        }
      }

      // ── Step 6: Subscription status (fire-and-forget) ────────────────────
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

  // ── Session gate ─────────────────────────────────────────────────────────────
  // A minimal spinner shown only for the duration of the JWT check (~100ms for
  // valid sessions, ~200ms if token needs refreshing). It prevents the Back-
  // after-logout exploit while keeping the delay imperceptible for normal use.
  if (!sessionVerified) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-container-low">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-teal border-t-transparent" />
      </div>
    )
  }

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
