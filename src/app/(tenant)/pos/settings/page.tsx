'use client'
import { useState, useEffect } from 'react'
import { ShoppingCart, GitBranch, ToggleLeft, ToggleRight } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import type { Branch } from '@/types/database'

interface BranchPosSettings {
  id: string
  name: string
  is_main: boolean | null
  pos_require_shift: boolean | null
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

      setBranches((prev) =>
        prev.map((b) => (b.id === branchId ? { ...b, pos_require_shift: newValue } : b))
      )
      const updatedBranches = (storeBranches as Branch[]).map((b) =>
        b.id === branchId ? { ...b, pos_require_shift: newValue } : b
      )
      setStoreBranches(updatedBranches)
      if (activeBranch?.id === branchId) {
        setActiveBranch({ ...activeBranch, pos_require_shift: newValue })
      }
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
      <div>
        <h1 className="text-xl font-bold text-gray-900">POS Settings</h1>
        <p className="text-sm text-gray-500">Configure point of sale behaviour per branch</p>
      </div>

      {/* Shift System card */}
      <div className="rounded-xl border border-gray-200 bg-white max-w-2xl">
        <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-teal-light">
            <ShoppingCart className="h-5 w-5 text-brand-teal" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Shift System</h3>
            <p className="text-xs text-gray-500">
              When enabled, staff must open a cash drawer shift before processing sales
            </p>
          </div>
        </div>

        <div className="px-5 py-3 bg-gray-50/60 border-b border-gray-100">
          <div className="flex items-start gap-2">
            <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
            <p className="text-xs text-gray-500">
              Toggle the shift system per branch. Disabling it lets staff open POS instantly
              without counting the cash drawer.
            </p>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {branches.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-gray-400">No branches found.</div>
          )}
          {branches.map((branch) => {
            const shiftRequired = branch.pos_require_shift !== false
            const isSaving = saving === branch.id
            const fb = feedback?.id === branch.id ? feedback : null

            return (
              <div key={branch.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-sm font-bold text-gray-500 uppercase">
                    {branch.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-gray-900">{branch.name}</span>
                      {branch.is_main && (
                        <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">
                          Main
                        </span>
                      )}
                    </div>
                    {fb ? (
                      <span className={`text-xs font-medium ${fb.ok ? 'text-green-600' : 'text-red-500'}`}>
                        {fb.ok ? 'Saved' : 'Failed to save'}
                      </span>
                    ) : (
                      <span className={`text-xs ${shiftRequired ? 'text-brand-teal' : 'text-gray-400'}`}>
                        {shiftRequired ? 'Shift required to open POS' : 'Shift system disabled'}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!canEdit || isSaving}
                  onClick={() => toggleShift(branch.id, branch.pos_require_shift)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all focus:outline-none
                    ${isSaving ? 'opacity-50 cursor-not-allowed' : canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}
                    ${shiftRequired
                      ? 'bg-brand-teal/10 text-brand-teal hover:bg-brand-teal/20'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                >
                  {shiftRequired
                    ? <ToggleRight className="h-4 w-4" />
                    : <ToggleLeft className="h-4 w-4" />
                  }
                  {isSaving ? 'Saving…' : shiftRequired ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            )
          })}
        </div>

        {!canEdit && (
          <div className="border-t border-gray-100 px-5 py-3 bg-amber-50/50">
            <p className="text-xs text-amber-700">Only business owners can change these settings.</p>
          </div>
        )}
      </div>
    </div>
  )
}
