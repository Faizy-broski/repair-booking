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

      // Update local state
      setBranches((prev) =>
        prev.map((b) => (b.id === branchId ? { ...b, pos_require_shift: newValue } : b))
      )

      // Sync auth store so the POS page picks up the change immediately
      const updatedBranches = (storeBranches as Branch[]).map((b) =>
        b.id === branchId ? { ...b, pos_require_shift: newValue } : b
      )
      setStoreBranches(updatedBranches)
      if (activeBranch?.id === branchId) {
        setActiveBranch({ ...activeBranch, pos_require_shift: newValue })
      }
    } finally {
      setSaving(null)
    }
  }

  const canEdit = isOwner()

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-teal-light">
            <ShoppingCart className="h-5 w-5 text-brand-teal" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Point of Sale</h3>
            <p className="text-xs text-gray-500">Configure POS behaviour per branch</p>
          </div>
        </div>

        {/* Shift system section */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">Shift System</p>
              <p className="mt-0.5 text-xs text-gray-500">
                When enabled, staff must open a cash drawer shift before processing sales.
                Disable per branch to allow direct POS access without a shift.
              </p>
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {branches.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-gray-400">No branches found.</div>
          )}
          {branches.map((branch) => {
            const shiftRequired = branch.pos_require_shift !== false
            const isSaving = saving === branch.id

            return (
              <div key={branch.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-500 uppercase">
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
                    <span className={`text-xs ${shiftRequired ? 'text-green-600' : 'text-gray-400'}`}>
                      {shiftRequired ? 'Shift required to open POS' : 'Shift system disabled'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!canEdit || isSaving}
                  onClick={() => toggleShift(branch.id, branch.pos_require_shift)}
                  className={`relative flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-all focus:outline-none
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
          <div className="border-t border-gray-100 px-5 py-3">
            <p className="text-xs text-gray-400">Only business owners can change these settings.</p>
          </div>
        )}
      </div>
    </div>
  )
}
