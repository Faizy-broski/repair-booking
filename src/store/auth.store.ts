import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Profile, Branch } from '@/types/database'

interface AuthState {
  profile: Profile | null
  activeBranch: Branch | null
  branches: Branch[]
  isLoading: boolean
  currency: string

  setProfile: (profile: Profile | null) => void
  setActiveBranch: (branch: Branch) => void
  setBranches: (branches: Branch[]) => void
  setLoading: (loading: boolean) => void
  setCurrency: (currency: string) => void
  clear: () => void

  // Computed helpers
  isOwner: () => boolean
  isManager: () => boolean
  canAccessAllBranches: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      profile: null,
      activeBranch: null,
      branches: [],
      isLoading: true,
      currency: 'GBP',

      setProfile: (profile) => set({ profile }),
      setActiveBranch: (branch) => set({ activeBranch: branch }),
      setBranches: (branches) => set({ branches }),
      setLoading: (isLoading) => set({ isLoading }),
      setCurrency: (currency) => set({ currency }),
      clear: () => set({ profile: null, activeBranch: null, branches: [], currency: 'GBP' }),

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
      name: 'auth-storage',
      partialize: (state) => ({
        profile: state.profile,
        activeBranch: state.activeBranch,
        branches: state.branches,
        currency: state.currency,
      }),
    }
  )
)
