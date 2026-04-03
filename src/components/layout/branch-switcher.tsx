'use client'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, Check, Building2, Layers } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useModuleConfigStore } from '@/store/module-config.store'
import { cn } from '@/lib/utils'
import type { Branch } from '@/types/database'

export function BranchSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { activeBranch, branches, setActiveBranch, canAccessAllBranches, profile } = useAuthStore()
  const { invalidate, fetchConfigs } = useModuleConfigStore()

  function handleBranchSwitch(branch: Branch) {
    setActiveBranch(branch)
    invalidate()
    fetchConfigs(branch.id)
  }

  // Staff: show static pill — their branch is fixed
  if (!canAccessAllBranches()) {
    if (!activeBranch) return null
    return (
      <div className={cn(
        'mx-3 mt-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5',
        collapsed && 'mx-auto mt-3 flex items-center justify-center w-10 h-10 rounded-xl px-0 py-0'
      )}>
        {collapsed ? (
          <Building2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
              <p className="truncate text-xs font-semibold text-white/90">{activeBranch.name}</p>
            </div>
            <p className="mt-0.5 text-[10px] text-white/40 capitalize pl-4">
              {profile?.role?.replace(/_/g, ' ')}
            </p>
          </>
        )}
      </div>
    )
  }

  // Owners always get the switcher (even with 1 branch — they may add more)
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={cn(
        'mx-3 mt-3 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-left transition-colors hover:bg-white/10 focus:outline-none',
        collapsed && 'mx-auto w-10 h-10 justify-center px-0 py-0'
      )}>
        {collapsed ? (
          <Building2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                <p className="truncate text-xs font-semibold text-white/90">{activeBranch?.name ?? 'Select Branch'}</p>
              </div>
              <p className="mt-0.5 text-[10px] text-white/40 capitalize pl-4">
                {profile?.role?.replace(/_/g, ' ')}
              </p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/40" />
          </>
        )}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[180px] overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-xl p-1"
          sideOffset={4}
          side="right"
          align="start"
        >
          {/* All Branches option for owners */}
          {branches.length > 1 && (
            <>
              <DropdownMenu.Item
                onClick={() => {
                  if (branches[0]) handleBranchSwitch(branches[0])
                }}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-white/50 hover:bg-white/10 focus:outline-none"
              >
                <Layers className="h-3.5 w-3.5" />
                All Branches (default)
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-white/10" />
            </>
          )}

          {branches.map((branch) => (
            <DropdownMenu.Item
              key={branch.id}
              onClick={() => handleBranchSwitch(branch)}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-white/80 hover:bg-brand-teal/20 hover:text-white focus:outline-none"
            >
              {activeBranch?.id === branch.id
                ? <Check className="h-3.5 w-3.5 text-brand-teal shrink-0" />
                : <span className="w-3.5 shrink-0" />
              }
              <span className="truncate">{branch.name}</span>
              {(branch as any).is_main && (
                <span className="ml-auto text-xs text-white/30">main</span>
              )}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
