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
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-teal
        ${enabled ? 'bg-brand-teal' : 'bg-gray-200'}
        ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
      `}
    >
      <span
        className={`
          pointer-events-none inline-flex h-5 w-5 transform items-center justify-center
          rounded-full bg-white shadow-lg ring-0
          transition-transform duration-300 ease-in-out
          ${enabled ? 'translate-x-8' : 'translate-x-1'}
        `}
      >
        {loading && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
      </span>
    </button>
  )
}

export default function PosSettingsPage() {
  const { branches: storeBranches, setBranches: setStoreBranches, activeBranch, setActiveBranch, isOwner } = useAuthStore()
  const [branches, setBranches] = useState<BranchPosSettings[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ id: string; ok: boolean } | null>(null)

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
    setFeedback(null)
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
      setFeedback({ id: branchId, ok: true })
    } catch {
      setFeedback({ id: branchId, ok: false })
    } finally {
      setSaving(null)
      setTimeout(() => setFeedback(null), 2500)
    }
  }

  const canEdit = isOwner()

  return (
    <div className="max-w-2xl space-y-6">

      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">POS Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Configure point of sale behaviour per branch</p>
      </div>

      {/* Shift System card */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

        {/* Card header */}
        <div className="flex items-center gap-4 border-b border-gray-100 px-6 py-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-teal-light">
            <ShoppingCart className="h-5 w-5 text-brand-teal" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Shift System</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              When enabled, staff must open a cash drawer shift before processing sales
            </p>
          </div>
        </div>

        {/* Info strip */}
        <div className="flex items-center gap-2 border-b border-blue-100/60 bg-blue-50/50 px-6 py-2.5">
          <Info className="h-3.5 w-3.5 shrink-0 text-blue-400" />
          <p className="text-xs text-blue-600">
            Toggle per branch. Disabling lets staff open POS instantly without counting the cash drawer.
          </p>
        </div>

        {/* Branch rows */}
        <div className="divide-y divide-gray-50">
          {branches.length === 0 && (
            <p className="px-6 py-10 text-center text-sm text-gray-400">No branches found.</p>
          )}

          {branches.map((branch) => {
            const enabled = branch.pos_require_shift !== false
            const isSaving = saving === branch.id
            const fb = feedback?.id === branch.id ? feedback : null

            return (
              <div key={branch.id} className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-gray-50/50">

                {/* Avatar + info */}
                <div className="flex items-center gap-3.5">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold uppercase tracking-wide transition-colors
                    ${enabled ? 'bg-brand-teal/10 text-brand-teal' : 'bg-gray-100 text-gray-400'}`}
                  >
                    {branch.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{branch.name}</span>
                      {branch.is_main && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold leading-none text-blue-600">
                          Main
                        </span>
                      )}
                    </div>
                    {fb ? (
                      <p className={`mt-0.5 text-xs font-medium ${fb.ok ? 'text-green-600' : 'text-red-500'}`}>
                        {fb.ok ? '✓ Saved' : '✗ Failed to save'}
                      </p>
                    ) : (
                      <p className={`mt-0.5 text-xs font-medium transition-colors ${enabled ? 'text-brand-teal' : 'text-gray-400'}`}>
                        {enabled ? 'Shift required to open POS' : 'Shift system disabled'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Toggle + label */}
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`w-10 text-right text-xs font-semibold transition-colors ${enabled ? 'text-brand-teal' : 'text-gray-400'}`}>
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
          <div className="border-t border-gray-100 bg-amber-50/50 px-6 py-3">
            <p className="text-xs text-amber-700">Only business owners can modify these settings.</p>
          </div>
        )}
      </div>
    </div>
  )
}
