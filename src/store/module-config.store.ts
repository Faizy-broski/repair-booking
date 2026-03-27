import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ModuleName, ResolvedModuleConfig, ResolvedModuleConfigMap } from '@/types/module-config'

interface ModuleConfigState {
  configs: ResolvedModuleConfigMap | null
  isLoading: boolean

  fetchConfigs: (branchId: string) => Promise<void>
  isModuleEnabled: (module: ModuleName) => boolean
  getConfig: <M extends ModuleName>(module: M) => ResolvedModuleConfig<M> | null
  invalidate: () => void
}

export const useModuleConfigStore = create<ModuleConfigState>()(
  persist(
    (set, get) => ({
      configs: null,
      isLoading: false,

      fetchConfigs: async (branchId: string) => {
        // If we already have configs, refresh silently in the background (no skeleton flash)
        const hasExisting = get().configs !== null
        if (!hasExisting) set({ isLoading: true })
        try {
          const res = await fetch(`/api/modules/config?branchId=${branchId}`)
          if (!res.ok) throw new Error(`Failed to fetch module configs: ${res.status}`)
          const json = await res.json()
          set({ configs: json.data as ResolvedModuleConfigMap, isLoading: false })
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
        set({ configs: null, isLoading: false })
      },
    }),
    {
      name: 'module-config-storage',
    }
  )
)
