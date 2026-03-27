'use client'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, Check, Building2, Layers } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useModuleConfigStore } from '@/store/module-config.store'
import { cn } from '@/lib/utils'
import type { Branch } from '@/types/database'

export function BranchSwitcher() {
  const { activeBranch, branches, setActiveBranch, canAccessAllBranches } = useAuthStore()
  const { invalidate, fetchConfigs } = useModuleConfigStore()

  function handleBranchSwitch(branch: Branch) {
    setActiveBranch(branch)
    invalidate()
    fetchConfigs(branch.id)
  }

  // Staff: show static pill — their branch is fixed
  if (!canAccessAllBranches()) {
    return activeBranch ? (
      <div className="hidden sm:flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
        <Building2 className="h-3.5 w-3.5" />
        {activeBranch.name}
      </div>
    ) : null
  }

  // Owners always get the switcher (even with 1 branch — they may add more)
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="hidden sm:flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-colors">
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="max-w-[120px] truncate">{activeBranch?.name ?? 'Select Branch'}</span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[180px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg p-1"
          sideOffset={4}
          align="end"
        >
          {/* All Branches option for owners */}
          {branches.length > 1 && (
            <>
              <DropdownMenu.Item
                onClick={() => {
                  // Clear to first/main branch to show all — handled by API via businessId fallback
                  if (branches[0]) handleBranchSwitch(branches[0])
                }}
                className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 focus:outline-none"
              >
                <Layers className="h-3.5 w-3.5" />
                All Branches (default)
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-gray-100" />
            </>
          )}

          {branches.map((branch) => (
            <DropdownMenu.Item
              key={branch.id}
              onClick={() => handleBranchSwitch(branch)}
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50 focus:outline-none"
            >
              {activeBranch?.id === branch.id
                ? <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                : <span className="w-3.5 shrink-0" />
              }
              <span className="truncate">{branch.name}</span>
              {(branch as any).is_main && (
                <span className="ml-auto text-xs text-gray-400">main</span>
              )}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
