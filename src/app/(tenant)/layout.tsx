'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
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
import { Toaster } from 'sonner'
import { getBrandStyle } from '@/lib/brand-theme'
import type { Profile, Branch } from '@/types/database'
import type { SubscriptionStatus } from '@/store/auth.store'
import type { SystemBroadcast } from '@/backend/services/broadcast.service'
import Providers from '@/components/providers'
import { Suspense } from 'react'

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
    setCurrency, setBrandColor, setSubscriptionStatus, setVerticalTemplateSlug, setBusinessName, clear,
    profile: cachedProfile, brandColor,
  } = useAuthStore()

  // Mirror brand CSS vars to <html> so Dialog.Portal modals (rendered to document.body)
  // also inherit the tenant brand color.
  useEffect(() => {
    const style = getBrandStyle(brandColor)
    const root = document.documentElement
    Object.entries(style).forEach(([k, v]) => root.style.setProperty(k, v as string))
  }, [brandColor])
  const { fetchConfigs, invalidate: invalidateConfigs } = useModuleConfigStore()
  const { setLoaded: setBroadcastsLoaded, addBroadcast, syncBroadcast, reset: resetBroadcasts } = useBroadcastsStore()
  const broadcastsBusinessId = useAuthStore((s) => s.profile?.business_id ?? '')
  // Stable callback for Realtime invalidation — avoids resubscribing on every render.
  // Zustand actions are stable references, so this callback never changes.
  const onModuleConfigChange = useCallback(() => invalidateConfigs(), [invalidateConfigs])
  const broadcastsFetched = useRef(false)

  // Load broadcasts once profile+business is available.
  // useRef guard prevents React 18 StrictMode double-invoke from firing two fetches.
  useEffect(() => {
    if (!broadcastsBusinessId || broadcastsFetched.current) return
    broadcastsFetched.current = true
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

  // Realtime: when an admin toggles a module in Settings, branch_module_overrides
  // changes → invalidate the client-side config cache so the sidebar updates immediately.
  // Subscription is skipped until activeBranch is known (filterValue guards against it).
  const activeBranchId = useAuthStore((s) => s.activeBranch?.id ?? '')
  useRealtime({
    table: 'branch_module_overrides',
    filterColumn: 'branch_id',
    filterValue: activeBranchId,
    onInsert: onModuleConfigChange,
    onUpdate: onModuleConfigChange,
    onDelete: onModuleConfigChange,
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
            setVerticalTemplateSlug((profile as any).verticalTemplateSlug ?? null)
            setBusinessName((profile as any).businessName ?? null)
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

      // Handle post-upgrade redirect before fetching context so invalidateConfigs()
      // forces a fresh module config fetch if the plan just changed.
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

      // Single server-side API call replaces 4-5 sequential client-side Supabase
      // round-trips. All DB queries run in parallel server-side with connection pooling.
      const res = await fetch('/api/auth/session-context').catch(() => null)

      if (!res || res.status === 401) {
        clear()
        window.location.replace('/login')
        return
      }

      if (!res.ok) {
        // Non-auth error — let the user in with whatever cached state we have
        setSessionVerified(true)
        setLoading(false)
        return
      }

      const json = await res.json()
      const {
        profile,
        branches,
        subscriptionStatus,
        currency: fetchedCurrency,
        brandColor: fetchedBrandColor,
        businessName: fetchedBusinessName,
      } = json.data as {
        profile: Profile & { verticalTemplateSlug: string | null }
        branches: Branch[]
        subscriptionStatus: SubscriptionStatus
        currency: string
        brandColor: string
        businessName: string | null
      }

      if (!profile) {
        clear()
        window.location.replace('/login')
        return
      }

      // Clear stale store if a different user logged in on this device
      const currentProfile = useAuthStore.getState().profile
      if (currentProfile && currentProfile.id !== profile.id) {
        clear()
      }

      // Set all store values synchronously — avoids multiple re-renders
      setProfile(profile)
      setVerticalTemplateSlug(profile.verticalTemplateSlug ?? null)
      setCurrency(fetchedCurrency ?? 'GBP')
      setBrandColor(fetchedBrandColor ?? '#008080')
      setBusinessName(fetchedBusinessName ?? null)
      setSubscriptionStatus(subscriptionStatus)

      // Reveal the layout immediately — sidebar and page content can render now
      setSessionVerified(true)

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
          // TTL-cached: returns immediately if configs are < 5 min old
          fetchConfigs(resolvedBranch.id)
        }
      }

      setLoading(false)
    }

    loadSession()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!isHydrated || !sessionVerified) {
    return (
      <div className="flex h-screen overflow-hidden bg-surface-container-low">
        {/* Sidebar skeleton */}
        <div className="hidden lg:flex w-64 flex-shrink-0 flex-col bg-surface-container border-r border-outline-variant">
          <div className="h-14 border-b border-outline-variant px-4 flex items-center">
            <div className="h-6 w-32 rounded bg-surface-container-high animate-pulse" />
          </div>
          <div className="flex-1 p-3 space-y-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-9 rounded-lg bg-surface-container-high animate-pulse" style={{ opacity: 1 - i * 0.08 }} />
            ))}
          </div>
        </div>
        {/* Main area skeleton */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="h-14 border-b border-outline-variant bg-surface-container px-4 flex items-center gap-3">
            <div className="h-6 w-6 rounded bg-surface-container-high animate-pulse" />
            <div className="h-5 w-40 rounded bg-surface-container-high animate-pulse" />
          </div>
          <div className="flex-1 p-6 space-y-4 overflow-hidden">
            <div className="h-8 w-48 rounded bg-surface-container animate-pulse" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-surface-container animate-pulse" />
              ))}
            </div>
            <div className="h-48 rounded-xl bg-surface-container animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <Providers>
      <div className="flex h-screen overflow-hidden bg-surface-container-low print:hidden" style={getBrandStyle(brandColor)}>
        <div className="hidden lg:flex">
          <Suspense fallback={null}>
            <Sidebar collapsed={collapsed} />
          </Suspense>
        </div>

        {sidebarOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="relative flex-shrink-0 animate-slide-in-left">
              <Suspense fallback={null}>
                <Sidebar onClose={() => setSidebarOpen(false)} />
              </Suspense>
            </div>
          </div>
        )}

        <div className="flex flex-1 flex-col overflow-hidden">
          {impersonatingBusiness && <ImpersonationBanner businessName={impersonatingBusiness} />}
          <Topbar onMenuClick={() => setSidebarOpen(true)} />
          <BroadcastBanner />
          <main className="relative flex-1 overflow-y-auto p-6">
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
