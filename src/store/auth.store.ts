import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Profile, Branch } from '@/types/database'

export interface SubscriptionStatus {
  status: string | null
  planType: 'free' | 'paid' | 'enterprise' | null
  planName: string | null
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  hasAccess: boolean
}

interface AuthState {
  profile: Profile | null
  activeBranch: Branch | null
  branches: Branch[]
  isLoading: boolean
  currency: string
  brandColor: string
  subscriptionStatus: SubscriptionStatus | null
  // Slug of the business's vertical template (e.g. "retail-store", "repair-shop").
  // Drives UI differences that depend on business type rather than module state —
  // e.g. simplified Inventory form fields for retail vs repair-shop businesses.
  verticalTemplateSlug: string | null

  setProfile: (profile: Profile | null) => void
  setActiveBranch: (branch: Branch) => void
  setBranches: (branches: Branch[]) => void
  setLoading: (loading: boolean) => void
  setCurrency: (currency: string) => void
  setBrandColor: (brandColor: string) => void
  setSubscriptionStatus: (status: SubscriptionStatus | null) => void
  setVerticalTemplateSlug: (slug: string | null) => void
  clear: () => void

  // Computed helpers
  isOwner: () => boolean
  isManager: () => boolean
  canAccessAllBranches: () => boolean
}

/**
 * Return a localStorage key that is scoped to the current subdomain.
 * This prevents User A's cached profile/branches from leaking into
 * User B's session when they log into a different business on the same browser.
 * e.g. "auth-storage-techfix", "auth-storage-repairlab", "auth-storage-root"
 */
function getStorageKey(): string {
  if (typeof window === 'undefined') return 'auth-storage'
  const hostname = window.location.hostname
  // Strip port from hostname
  const cleanHost = hostname.split(':')[0]
  // Extract subdomain
  const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'repairbooking.co.uk').split(':')[0]
  let sub: string | null = null
  if (cleanHost.endsWith('.localhost')) sub = cleanHost.replace('.localhost', '')
  else if (cleanHost.endsWith(`.${rootDomain}`)) sub = cleanHost.replace(`.${rootDomain}`, '')
  return sub ? `auth-storage-${sub}` : 'auth-storage-root'
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      profile: null,
      activeBranch: null,
      branches: [],
      isLoading: true,
      currency: 'GBP',
      brandColor: '#008080',
      subscriptionStatus: null,
      verticalTemplateSlug: null,

      setProfile: (profile) => set({ profile }),
      setActiveBranch: (branch) => set({ activeBranch: branch }),
      setBranches: (branches) => set({ branches }),
      setLoading: (isLoading) => set({ isLoading }),
      setCurrency: (currency) => set({ currency }),
      setBrandColor: (brandColor) => set({ brandColor }),
      setSubscriptionStatus: (subscriptionStatus) => set({ subscriptionStatus }),
      setVerticalTemplateSlug: (verticalTemplateSlug) => set({ verticalTemplateSlug }),
      clear: () => set({ profile: null, activeBranch: null, branches: [], currency: 'GBP', brandColor: '#008080', subscriptionStatus: null, verticalTemplateSlug: null }),

      isOwner: () => {
        const role = get().profile?.role
        return role === 'business_owner' || role === 'super_admin'
      },
      isManager: () => {
        const role = get().profile?.role
        return ['business_owner', 'branch_manager', 'super_admin'].includes(role ?? '')
      },
      canAccessAllBranches: () => {
        const role = get().profile?.role
        return ['business_owner', 'super_admin'].includes(role ?? '')
      },
    }),
    {
      name: getStorageKey(),
      skipHydration: true, // Prevent SSR hydration mismatch — layout calls rehydrate() after mount
      partialize: (state) => ({
        profile: state.profile,
        activeBranch: state.activeBranch,
        branches: state.branches,
        currency: state.currency,
        brandColor: state.brandColor,
        verticalTemplateSlug: state.verticalTemplateSlug,
      }),
    }
  )
)

