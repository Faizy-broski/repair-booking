'use client'
import { useAuthStore } from '@/store/auth.store'
import type { Branch } from '@/types/database'

/**
 * Convenience hook for accessing the active branch and branch list.
 */
export function useBranch() {
  const { activeBranch, branches, setActiveBranch, profile } = useAuthStore()

  const canSwitchBranch = profile?.role === 'business_owner' || profile?.role === 'super_admin'

  function switchBranch(branch: Branch) {
    if (canSwitchBranch) {
      setActiveBranch(branch)
    }
  }

  return {
    activeBranch,
    branches,
    switchBranch,
    canSwitchBranch,
    branchId: activeBranch?.id ?? null,
  }
}
