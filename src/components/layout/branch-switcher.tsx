'use client'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, Check, Layers } from 'lucide-react'
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

/** "Premier Mobile Tyre" → "PM" — stands in for a logo when none is uploaded. */
function initials(name?: string | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase()
}

function InitialsBadge({ name, className }: { name?: string | null; className?: string }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg bg-brand-teal font-bold tracking-tight text-white',
        className
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

function BranchCard({
  logoUrl,
  businessName,
  branchName,
  showChevron = false,
}: {
  logoUrl?: string | null
  businessName?: string | null
  branchName: string
  showChevron?: boolean
}) {
  const branchRow = (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
      <span className="truncate text-[13px] font-semibold text-white/75">{branchLabel(branchName)}</span>
      {showChevron && <ChevronDown className="h-4 w-4 shrink-0 text-white/50" />}
    </span>
  )

  // With an uploaded logo: compact logo banner above the names.
  if (logoUrl) {
    return (
      <div className="w-full px-3 pb-3 pt-3">
        <div className="mb-2 flex h-14 w-full items-center justify-center overflow-hidden rounded-xl ring-1 ring-white/10">
          <img src={logoUrl} alt={businessName ?? branchName} className="h-full w-full object-cover" />
        </div>
        {/* Centred under the logo banner so the header reads as one block */}
        {businessName && (
          <p className="truncate text-center text-lg font-extrabold leading-tight tracking-tight text-white" title={businessName}>{businessName}</p>
        )}
        <div className="mt-0.5 flex justify-center">{branchRow}</div>
      </div>
    )
  }

  // No logo: a single compact row — initials badge + name — so the menu gets the space.
  return (
    <div className="flex w-full items-center gap-2.5 px-3 py-3">
      <InitialsBadge name={businessName ?? branchName} className="h-9 w-9 text-sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-extrabold leading-tight tracking-tight text-white" title={businessName ?? undefined}>
          {businessName ?? branchLabel(branchName)}
        </p>
        <div className="mt-0.5">{branchRow}</div>
      </div>
    </div>
  )
}

export function BranchSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { activeBranch, branches, setActiveBranch, canAccessAllBranches, businessName } = useAuthStore()
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
          <InitialsBadge name={businessName ?? activeBranch?.name} className="h-full w-full rounded-none text-xs" />
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
          showChevron
        />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-[100] w-[var(--radix-dropdown-menu-trigger-width)] max-h-[60vh] overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 p-1 shadow-2xl"
          sideOffset={0}
          side="bottom"
          align="start"
          collisionPadding={8}
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
