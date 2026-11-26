'use client'
import { useState, useEffect } from 'react'
import { ShoppingCart, Info, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { PageHeader } from '@/components/shared/page-header'
import type { Branch } from '@/types/database'

interface BranchPosSettings {
  id: string
  name: string
  is_main: boolean | null
  pos_require_shift: boolean | null
}

function Toggle({ enabled, onChange, disabled, loading }: {
  enabled: boolean
  onChange: () => void
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled || loading}
      onClick={onChange}
      className={`
        relative inline-flex h-7 w-14 shrink-0 items-center rounded-full
        transition-colors duration-300 ease-in-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary
        ${enabled ? 'bg-primary' : 'bg-surface-container-high'}
        ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
      `}
    >
      <span
        className={`
          pointer-events-none inline-flex h-5 w-5 transform items-center justify-center
          rounded-full bg-surface-container-lowest ring-0
          transition-transform duration-300 ease-in-out
          ${enabled ? 'translate-x-8' : 'translate-x-1'}
        `}
      >
        {loading && <Loader2 className="h-3 w-3 animate-spin text-on-surface-variant" />}
      </span>
    </button>
  )
}

export default function PosSettingsPage() {
  const { branches: storeBranches, setBranches: setStoreBranches, activeBranch, setActiveBranch, isOwner } = useAuthStore()
  const [branches, setBranches] = useState<BranchPosSettings[]>([])
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    setBranches(
      (storeBranches as Branch[]).map((b) => ({
        id: b.id,
        name: b.name,
        is_main: b.is_main ?? null,
        pos_require_shift: b.pos_require_shift ?? null,
      }))
    )
  }, [storeBranches])

  async function toggleShift(branchId: string, currentValue: boolean | null) {
    const newValue = currentValue === false ? true : false
    setSaving(branchId)
    try {
      const res = await fetch(`/api/settings/branches/${branchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pos_require_shift: newValue }),
      })
      if (!res.ok) throw new Error('Failed')
      setBranches(prev => prev.map(b => b.id === branchId ? { ...b, pos_require_shift: newValue } : b))
      const updatedBranches = (storeBranches as Branch[]).map(b =>
        b.id === branchId ? { ...b, pos_require_shift: newValue } : b
      )
      setStoreBranches(updatedBranches)
      if (activeBranch?.id === branchId) setActiveBranch({ ...activeBranch, pos_require_shift: newValue })
    } finally {
      setSaving(null)
    }
  }

  const canEdit = isOwner()

  return (
    <div className="max-w-4xl space-y-6">

      <PageHeader title="POS Settings" description="Configure point of sale behaviour per branch" />

      {/* Shift System card */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest">

        {/* Card header */}
        <div className="flex items-start gap-3 p-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShoppingCart className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-on-surface">Shift System</h2>
            <p className="mt-0.5 text-sm text-on-surface-variant">When enabled, staff must open a cash drawer shift before processing sales</p>
          </div>
        </div>

        {/* Info strip */}
        <div className="flex items-center gap-2 border-y border-outline-variant bg-surface-container-low px-5 py-3">
          <Info className="h-3.5 w-3.5 shrink-0 text-on-surface-variant" />
          <p className="text-xs text-on-surface-variant">
            Toggle per branch. Disabling lets staff open POS instantly without counting the cash drawer.
          </p>
        </div>

        {/* Branch rows */}
        <div className="divide-y divide-outline-variant">
          {branches.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-on-surface-variant">No branches found.</p>
          )}

          {branches.map((branch) => {
            const enabled = branch.pos_require_shift !== false
            const isSaving = saving === branch.id

            return (
              <div key={branch.id} className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-container-low">

                {/* Avatar + info */}
                <div className="flex items-center gap-3.5">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-colors
                    ${enabled ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant'}`}
                  >
                    {branch.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-on-surface">{branch.name}</span>
                      {branch.is_main && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary leading-none">
                          Main
                        </span>
                      )}
                    </div>
                    <p className={`mt-0.5 text-xs font-medium transition-colors ${enabled ? 'text-primary' : 'text-on-surface-variant'}`}>
                      {enabled ? 'Shift required to open POS' : 'Shift system disabled'}
                    </p>
                  </div>
                </div>

                {/* Toggle + label */}
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs font-semibold w-12 text-right transition-colors ${enabled ? 'text-primary' : 'text-on-surface-variant'}`}>
                    {enabled ? 'On' : 'Off'}
                  </span>
                  <Toggle
                    enabled={enabled}
                    loading={isSaving}
                    disabled={!canEdit}
                    onChange={() => toggleShift(branch.id, branch.pos_require_shift)}
                  />
                </div>

              </div>
            )
          })}
        </div>

        {!canEdit && (
          <div className="border-t border-outline-variant bg-surface-container-low px-5 py-3">
            <p className="text-xs text-on-surface-variant">Only business owners can modify these settings.</p>
          </div>
        )}
      </div>
    </div>
  )
}
