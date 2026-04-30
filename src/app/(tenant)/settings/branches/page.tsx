'use client'
import { useState, useEffect } from 'react'
import { Plus, ImageUpload, Input, Button } from 'lucide-react' // Wait, I need correct imports
import { Button as UIButton } from '@/components/ui/button'
import { Input as UIInput } from '@/components/ui/input'
import { ImageUpload as UIImageUpload } from '@/components/ui/image-upload'
import { useAuthStore } from '@/store/auth.store'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import { Plus as PlusIcon } from 'lucide-react'

interface Branch {
  id: string; name: string; address: string | null; phone: string | null; email: string | null; is_active: boolean
  logo_url?: string | null
}

const branchSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  logo_url: z.string().url().optional().or(z.literal('')),
})
type BranchFormData = z.infer<typeof branchSchema>

export default function BranchesSettingsPage() {
  const { branches: storeBranches, setBranches: setStoreBranches, activeBranch, setActiveBranch } = useAuthStore()
  const [branchList, setBranchList] = useState<Branch[]>(storeBranches as Branch[])
  const [editBranchId, setEditBranchId] = useState<string | null>(null)
  const [showNewBranchForm, setShowNewBranchForm] = useState(false)
  const [branchCreateError, setBranchCreateError] = useState<string | null>(null)

  const branchForm = useForm<BranchFormData>({ resolver: zodResolver(branchSchema) })
  const newBranchForm = useForm<BranchFormData>({ resolver: zodResolver(branchSchema) })

  async function refreshBranches() {
    const res = await fetch('/api/settings/branches')
    const json = await res.json()
    const updated = json.data ?? []
    setBranchList(updated)
    setStoreBranches(updated)
    // Sync activeBranch so sidebar logo updates immediately without sign-out/sign-in
    if (activeBranch) {
      const refreshed = updated.find((b: Branch) => b.id === activeBranch.id)
      if (refreshed) setActiveBranch(refreshed)
    }
  }

  async function onSaveBranch(data: BranchFormData) {
    if (!editBranchId) return
    await fetch(`/api/settings/branches/${editBranchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setEditBranchId(null)
    branchForm.reset()
    refreshBranches()
  }

  async function onCreateBranch(data: BranchFormData) {
    setBranchCreateError(null)
    const res = await fetch('/api/settings/branches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      newBranchForm.reset()
      setShowNewBranchForm(false)
      refreshBranches()
    } else {
      const json = await res.json()
      setBranchCreateError(json?.error?.message ?? 'Failed to create branch.')
    }
  }

  function startEditBranch(branch: Branch) {
    setEditBranchId(branch.id)
    branchForm.reset({ name: branch.name, address: branch.address ?? '', phone: branch.phone ?? '', email: branch.email ?? '', logo_url: branch.logo_url ?? '' })
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="font-semibold text-gray-900">Branches</h3>
        <UIButton size="sm" onClick={() => { setShowNewBranchForm(true); setBranchCreateError(null); newBranchForm.reset() }}>
          <PlusIcon className="h-4 w-4" /> Add Branch
        </UIButton>
      </div>
      
      {showNewBranchForm && (
        <div className="border-b border-gray-100 bg-blue-50/40 px-4 py-4">
          <p className="mb-3 text-sm font-semibold text-gray-700">New Branch</p>
          {branchCreateError && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {branchCreateError}
            </div>
          )}
          <form onSubmit={newBranchForm.handleSubmit(onCreateBranch)} className="space-y-3">
            <UIImageUpload label="Branch Logo" value={newBranchForm.watch('logo_url') || ''} onChange={(url) => newBranchForm.setValue('logo_url', url)} />
            <div className="grid grid-cols-2 gap-3">
              <UIInput label="Branch Name *" required {...newBranchForm.register('name')} />
              <UIInput label="Phone" {...newBranchForm.register('phone')} />
            </div>
            <UIInput label="Address" {...newBranchForm.register('address')} />
            <UIInput label="Email" type="email" {...newBranchForm.register('email')} />
            <div className="flex gap-2">
              <UIButton type="submit" size="sm" loading={newBranchForm.formState.isSubmitting}>Create Branch</UIButton>
              <UIButton type="button" size="sm" variant="outline" onClick={() => { setShowNewBranchForm(false); setBranchCreateError(null) }}>Cancel</UIButton>
            </div>
          </form>
        </div>
      )}

      <div className="divide-y divide-gray-100">
        {branchList.map((branch) => (
          <div key={branch.id} className="px-4 py-4">
            {editBranchId === branch.id ? (
              <form onSubmit={branchForm.handleSubmit(onSaveBranch)} className="space-y-3">
                <UIImageUpload label="Branch Logo" value={branchForm.watch('logo_url') || ''} onChange={(url) => branchForm.setValue('logo_url', url)} />
                <div className="grid grid-cols-2 gap-3">
                  <UIInput label="Branch Name" required {...branchForm.register('name')} />
                  <UIInput label="Phone" {...branchForm.register('phone')} />
                </div>
                <UIInput label="Address" {...branchForm.register('address')} />
                <UIInput label="Email" type="email" {...branchForm.register('email')} />
                <div className="flex gap-2">
                  <UIButton type="submit" size="sm" loading={branchForm.formState.isSubmitting}>Save</UIButton>
                  <UIButton type="button" size="sm" variant="outline" onClick={() => setEditBranchId(null)}>Cancel</UIButton>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{branch.name}</p>
                    {(branch as any).is_main && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Main</span>
                    )}
                  </div>
                  {branch.address && <p className="text-sm text-gray-500">{branch.address}</p>}
                  {branch.phone && <p className="text-xs text-gray-400">{branch.phone}</p>}
                </div>
                <UIButton size="sm" variant="outline" onClick={() => startEditBranch(branch as Branch)}>
                  Edit
                </UIButton>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
