'use client'
import { useState, useEffect } from 'react'
import { Timer, Info, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
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
        ${enabled ? 'bg-brand-teal' : 'bg-surface-container-high'}
        ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
      `}
    >
      <span
        className={`
          pointer-events-none inline-flex h-5 w-5 transform items-center justify-center
          rounded-full bg-surface shadow-lg ring-0
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
    <div className="space-y-6">

      <PageHeader title="POS Settings" description="Configure point of sale behaviour per branch" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,300px)_1fr]">

        {/* Shift System explainer */}
        <div className="space-y-3 lg:pt-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Timer className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-semibold text-on-surface">Shift System</h2>
          <p className="text-sm leading-relaxed text-on-surface-variant">
            When enabled, staff must open a cash drawer shift before processing sales.
          </p>
          <div className="flex gap-2.5 rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-on-surface-variant" />
            <p className="text-xs leading-relaxed text-on-surface-variant">
              Toggle per branch. Disabling lets staff open POS instantly without counting the cash drawer.
            </p>
          </div>
          {!canEdit && (
            <p className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-700">
              Only business owners can modify these settings.
            </p>
          )}
        </div>

        {/* Branch cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {branches.length === 0 && (
            <p className="col-span-full rounded-2xl border border-outline-variant py-10 text-center text-sm text-on-surface-variant">No branches found.</p>
          )}

          {branches.map((branch, i) => {
            const enabled = branch.pos_require_shift !== false
            const isSaving = saving === branch.id
            const fb = feedback?.id === branch.id ? feedback : null

            return (
              <div
                key={branch.id}
                className={`flex flex-col rounded-2xl border bg-surface-container-lowest p-5 transition-colors ${enabled ? 'border-primary/50 ring-1 ring-primary/10' : 'border-outline-variant'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-full text-base font-semibold uppercase transition-colors ${enabled ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface'}`}>
                    {branch.name.charAt(0)}
                  </span>
                  <span className="font-mono text-[11px] text-on-surface-variant">
                    Branch {String(i + 1).padStart(2, '0')}
                  </span>
                </div>

                <div className="mt-4 min-h-[56px]">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-on-surface">{branch.name}</span>
                    {branch.is_main && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Main</span>
                    )}
                  </div>
                  {fb ? (
                    <p className={`mt-1 text-sm ${fb.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                      {fb.ok ? '✓ Saved' : '✗ Failed to save'}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-on-surface-variant">
                      {enabled ? 'Shift required to open POS' : 'Shift system disabled'}
                    </p>
                  )}
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-outline-variant pt-4">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${enabled ? 'bg-emerald-500/10 text-emerald-600' : 'bg-surface-container text-on-surface-variant'}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
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
      </div>
    </div>
  )
}
