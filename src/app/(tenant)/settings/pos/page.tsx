'use client'
import { useState, useEffect } from 'react'
import { ShoppingCart, Info, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
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
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0d9488]
        ${enabled ? 'bg-[#0d9488]' : 'bg-surface-container-high'}
        ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
      `}
    >
      <span
        className={`
          pointer-events-none inline-flex h-5 w-5 transform items-center justify-center
          rounded-full bg-surface shadow-md ring-0
          transition-transform duration-300 ease-in-out
          ${enabled ? 'translate-x-8' : 'translate-x-1'}
        `}
      >
        {loading && <Loader2 className="h-3 w-3 animate-spin text-outline" />}
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
    <div className="max-w-2xl space-y-6">

      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-on-surface">POS Settings</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Configure point of sale behaviour per branch</p>
      </div>

      {/* Shift System card */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">

        {/* Card header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-outline-variant">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0d9488]/10">
            <ShoppingCart className="h-5 w-5 text-[#0d9488]" />
          </div>
          <div>
            <h2 className="font-semibold text-on-surface">Shift System</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">When enabled, staff must open a cash drawer shift before processing sales</p>
          </div>
        </div>

        {/* Info strip */}
        <div className="flex items-center gap-2 bg-blue-50/60 border-b border-blue-100/60 px-6 py-2.5">
          <Info className="h-3.5 w-3.5 shrink-0 text-blue-400" />
          <p className="text-xs text-blue-600">
            Toggle per branch. Disabling lets staff open POS instantly without counting the cash drawer.
          </p>
        </div>

        {/* Branch rows */}
        <div className="divide-y divide-outline-variant">
          {branches.length === 0 && (
            <p className="px-6 py-10 text-center text-sm text-outline">No branches found.</p>
          )}

          {branches.map((branch) => {
            const enabled = branch.pos_require_shift !== false
            const isSaving = saving === branch.id

            return (
              <div key={branch.id} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-surface-container-low/50 transition-colors">

                {/* Avatar + info */}
                <div className="flex items-center gap-3.5">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold uppercase tracking-wide transition-colors
                    ${enabled ? 'bg-[#0d9488]/10 text-[#0d9488]' : 'bg-surface-container text-outline'}`}
                  >
                    {branch.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-on-surface">{branch.name}</span>
                      {branch.is_main && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-600 leading-none">
                          Main
                        </span>
                      )}
                    </div>
                    <p className={`mt-0.5 text-xs font-medium transition-colors ${enabled ? 'text-[#0d9488]' : 'text-outline'}`}>
                      {enabled ? 'Shift required to open POS' : 'Shift system disabled'}
                    </p>
                  </div>
                </div>

                {/* Toggle + label */}
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs font-semibold w-12 text-right transition-colors ${enabled ? 'text-[#0d9488]' : 'text-outline'}`}>
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
          <div className="border-t border-outline-variant bg-surface-container-low/50 px-6 py-3">
            <p className="text-xs text-outline">Only business owners can modify these settings.</p>
          </div>
        )}
      </div>
    </div>
  )
}
