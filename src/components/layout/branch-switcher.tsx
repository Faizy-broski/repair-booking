'use client'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, Check, Building2, Layers } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useModuleConfigStore } from '@/store/module-config.store'
import { cn } from '@/lib/utils'
import type { Branch } from '@/types/database'

// Older branches were seeded as "{Business Name} - {Label}" (e.g. "Kokab Shoes - Main").
// Once a business is renamed, that stored label no longer matches — strip the
// "<anything> - " prefix so the sidebar shows just the label (e.g. "Main").
function branchLabel(branchName: string): string {
  const dashIndex = branchName.lastIndexOf(' - ')
  return dashIndex === -1 ? branchName : branchName.slice(dashIndex + 3)
}

function BranchCard({
  logoUrl,
  businessName,
  branchName,
  role,
  showChevron = false,
}: {
  logoUrl?: string | null
  businessName?: string | null
  branchName: string
  role?: string | null
  showChevron?: boolean
}) {
  return (
    <div className="relative w-full pb-3">
      {/* ── Content ── */}
      <div className="relative z-10 flex flex-col items-center pt-4 px-4">
        {/* Cover Image / Logo - Wide Rectangle, no white padding */}
        <div className="mb-2.5 flex h-20 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-sidebar-bg shadow-lg shadow-black/20 ring-1 ring-white/10">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={businessName ?? branchName}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-white/5 to-transparent">
              <Building2 className="h-6 w-6 text-white/30" />
            </div>
          )}
        </div>

        {/* Business name / Branch name / Role */}
        <div className="flex w-full flex-col items-center">
          {businessName && (
            <p className="text-center text-[16px] font-extrabold text-white leading-snug tracking-tight break-words max-w-[190px]">
              {businessName}
            </p>
          )}
          <div className="mt-0.5 flex items-center justify-center gap-1.5 w-full">
            <p className="truncate text-[14px] font-bold text-white/80 leading-tight tracking-tight max-w-[160px]">
              {branchLabel(branchName)}
            </p>
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
            {showChevron && (
              <ChevronDown className="h-4 w-4 shrink-0 text-white/50 ml-0.5" />
            )}
          </div>
          {role && (
            <p className="mt-1 text-[11px] font-medium capitalize tracking-wider text-brand-teal/70">
              {role.replace(/_/g, ' ')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export function BranchSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { activeBranch, branches, setActiveBranch, canAccessAllBranches, profile, businessName } = useAuthStore()
  const { fetchConfigs } = useModuleConfigStore()

  function handleBranchSwitch(branch: Branch) {
    setActiveBranch(branch)
    // Do NOT invalidate() here — it sets configs=null which blanks the sidebar
    // while the fetch runs. fetchConfigs detects the branch change (!isSameBranch)
    // and fetches fresh data while keeping the old configs visible during the request.
    fetchConfigs(branch.id)
  }

  /* ── Collapsed sidebar: small logo square ── */
  if (collapsed) {
    return (
      <div className="mx-auto mt-3 flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
        {activeBranch?.logo_url ? (
          <img
            src={activeBranch.logo_url}
            alt="Branch"
            className="h-full w-full object-cover"
          />
        ) : (
          <Building2 className="h-4 w-4 text-emerald-400" />
        )}
      </div>
    )
  }

  /* ── Staff: static banner, no dropdown ── */
  if (!canAccessAllBranches()) {
    if (!activeBranch) return null
    return (
      <div className="w-full border-b border-white/8">
        <BranchCard
          logoUrl={activeBranch.logo_url}
          businessName={businessName}
          branchName={activeBranch.name}
          role={profile?.role}
        />
      </div>
    )
  }

  /* ── Owners: full-width dropdown ── */
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="w-full border-b border-white/8 text-left transition-opacity hover:opacity-90 focus:outline-none">
        <BranchCard
          logoUrl={activeBranch?.logo_url}
          businessName={businessName}
          branchName={activeBranch?.name ?? 'Select Branch'}
          role={profile?.role}
          showChevron
        />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[200px] overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl p-1"
          sideOffset={4}
          side="right"
          align="start"
          alignOffset={96}
        >
          {branches.length > 1 && (
            <>
              <DropdownMenu.Item
                onClick={() => { if (branches[0]) handleBranchSwitch(branches[0]) }}
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
                : <span className="w-3.5 shrink-0" />}
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
