import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ModuleName, ResolvedModuleConfig, ResolvedModuleConfigMap } from '@/types/module-config'

// How long cached configs are considered fresh before a background re-fetch.
// The server-side Next.js cache (unstable_cache) already has a 5-min TTL;
// matching here means the client never asks for data the server would also cache.
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface ModuleConfigState {
  configs: ResolvedModuleConfigMap | null
  /** The branchId these configs belong to — used to detect branch switches */
  cachedBranchId: string | null
  /** Unix timestamp (ms) when configs were last fetched — used for TTL */
  fetchedAt: number | null
  /** True only on the very first load when there is no localStorage data at all */
  isLoading: boolean

  /**
   * Fetch configs for a branch with a stale-while-revalidate strategy:
   * - If same branch + data < 5 min old: return immediately (no network call)
   * - If same branch + data exists but stale: show cached data, refresh silently
   * - If different branch or no data: show loading state, fetch, then render
   */
  fetchConfigs: (branchId: string) => Promise<void>
  isModuleEnabled: (module: ModuleName) => boolean
  getConfig: <M extends ModuleName>(module: M) => ResolvedModuleConfig<M> | null
  invalidate: () => void
}

export const useModuleConfigStore = create<ModuleConfigState>()(
  persist(
    (set, get) => ({
      configs: null,
      cachedBranchId: null,
      fetchedAt: null,
      isLoading: false,

      fetchConfigs: async (branchId: string) => {
        const { configs, cachedBranchId, fetchedAt } = get()
        const now = Date.now()
        const isSameBranch = cachedBranchId === branchId
        const isFresh = fetchedAt !== null && (now - fetchedAt) < CACHE_TTL_MS
        const hasData = configs !== null

        // ── Cache hit: same branch, data fresh ───────────────────────────────
        // Skip the network call entirely. The server-side cache would return the
        // same response anyway; this avoids the round-trip on every page load.
        if (isSameBranch && isFresh && hasData) return

        // ── Stale-while-revalidate: have data but it's old ───────────────────
        // Show the cached configs immediately (no skeleton), then refresh in
        // background. The user sees content instantly.
        const isFirstLoad = !hasData || !isSameBranch
        if (isFirstLoad) set({ isLoading: true })

        try {
          const res = await fetch(`/api/modules/config?branchId=${branchId}`)
          if (!res.ok) throw new Error(`Failed to fetch module configs: ${res.status}`)
          const json = await res.json()
          set({
            configs: json.data as ResolvedModuleConfigMap,
            cachedBranchId: branchId,
            fetchedAt: Date.now(),
            isLoading: false,
          })
        } catch (err) {
          console.error('[ModuleConfigStore] fetchConfigs error:', err)
          set({ isLoading: false })
        }
      },

      isModuleEnabled: (module: ModuleName) => {
        return get().configs?.[module]?._meta?.is_enabled ?? false
      },

      getConfig: <M extends ModuleName>(module: M) => {
        return (get().configs?.[module] ?? null) as ResolvedModuleConfig<M> | null
      },

      invalidate: () => {
        // Only clear the in-memory state — do NOT clear localStorage here.
        // Keeping persisted data means the next page load can still serve
        // stale configs instantly while a fresh fetch runs in the background.
        // The TTL check in fetchConfigs will force a network refresh.
        set({ configs: null, cachedBranchId: null, fetchedAt: null, isLoading: false })
      },
    }),
    {
      name: 'module-config-storage',
      // Persist everything needed to reconstruct the cache state
      partialize: (state) => ({
        configs: state.configs,
        cachedBranchId: state.cachedBranchId,
        fetchedAt: state.fetchedAt,
      }),
    }
  )
)
