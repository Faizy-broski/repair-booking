'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button as UIButton } from '@/components/ui/button'
import { Input as UIInput } from '@/components/ui/input'
import { ImageUpload as UIImageUpload } from '@/components/ui/image-upload'
import { useAuthStore } from '@/store/auth.store'
import { useForm, useFieldArray, useFormContext, Controller } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import { Plus as PlusIcon, UserRound, MapPin, Phone, Pencil, Building2, Mail, ShieldCheck, Check, Loader2 } from 'lucide-react'
import { showApiError } from '@/lib/limit-error'

interface BranchUser {
  id: string; full_name: string | null; email: string | null; role: string; avatar_url: string | null; is_active: boolean | null
}

interface Branch {
  id: string; name: string; address: string | null; phone: string | null; email: string | null; is_active: boolean
  logo_url?: string | null; profiles?: BranchUser[]
}

const branchSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  logo_url: z.string().url().optional().or(z.literal('')),
})
type BranchFormData = z.infer<typeof branchSchema>

const newBranchSchema = branchSchema.extend({
  manager_full_name: z.string().min(1, 'Full name is required'),
  manager_email: z.string().email('A valid email is required'),
  manager_password: z.string().min(6, 'Min. 6 characters'),
  manager_role: z.enum(['cashier', 'staff', 'branch_manager'], { message: 'Select a role' }),
})
type NewBranchFormData = z.infer<typeof newBranchSchema>

export default function BranchesSettingsPage() {
  const router = useRouter()
  const { branches: storeBranches, setBranches: setStoreBranches, activeBranch, setActiveBranch } = useAuthStore()
  const [branchList, setBranchList] = useState<Branch[]>(storeBranches as Branch[])
  const [editBranchId, setEditBranchId] = useState<string | null>(null)
  const [showNewBranchForm, setShowNewBranchForm] = useState(false)
  const [branchCreateError, setBranchCreateError] = useState<string | null>(null)
  // per-user edit state: userId -> { full_name, role, saving }
  const [userEdits, setUserEdits] = useState<Record<string, { full_name: string; role: string; saving: boolean }>>({})

  const branchForm = useForm<BranchFormData>({ resolver: zodResolver(branchSchema) })
  const newBranchForm = useForm<NewBranchFormData>({ resolver: zodResolver(newBranchSchema) })

  // Fetch fresh data (with profiles) on mount
  useEffect(() => { refreshBranches() }, [])

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

  async function onCreateBranch(data: NewBranchFormData) {
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
      if (json?.error?.code === 'LIMIT_REACHED') {
        // Branch creation checks both the branch limit and the user limit
        // (a branch always comes with a manager account) — route to whichever
        // dimension the backend actually rejected on.
        const limitKey = (json.error.message as string)?.startsWith('User limit') ? 'max_users' : 'max_branches'
        showApiError(json.error, router, limitKey)
      } else {
        setBranchCreateError(json?.error?.message ?? 'Failed to create branch.')
      }
    }
  }

  function startEditBranch(branch: Branch) {
    setEditBranchId(branch.id)
    branchForm.reset({ name: branch.name, address: branch.address ?? '', phone: branch.phone ?? '', email: branch.email ?? '', logo_url: branch.logo_url ?? '' })
    // Seed editable state for each user
    const seeds: Record<string, { full_name: string; role: string; saving: boolean }> = {}
    branch.profiles?.forEach((u) => {
      seeds[u.id] = { full_name: u.full_name ?? '', role: u.role, saving: false }
    })
    setUserEdits(seeds)
  }

  async function saveUser(userId: string) {
    const edits = userEdits[userId]
    if (!edits) return
    setUserEdits((prev) => ({ ...prev, [userId]: { ...prev[userId], saving: true } }))
    await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: edits.full_name, role: edits.role }),
    })
    setUserEdits((prev) => ({ ...prev, [userId]: { ...prev[userId], saving: false } }))
    refreshBranches()
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-teal/10">
            <Building2 className="h-4 w-4 text-brand-teal" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Branches</h3>
            <p className="text-xs text-gray-400">{branchList.length} location{branchList.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <UIButton size="sm" onClick={() => { setShowNewBranchForm(true); setBranchCreateError(null); newBranchForm.reset() }}>
          <PlusIcon className="h-4 w-4" /> Add Branch
        </UIButton>
      </div>
      
      {showNewBranchForm && (
        <div className="border-b border-gray-100 bg-blue-50/40 px-4 py-5">
          <p className="mb-3 text-sm font-semibold text-gray-700">New Branch</p>
          {branchCreateError && (
            <div className="mb-3 max-w-2xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {branchCreateError}
            </div>
          )}
          <form onSubmit={newBranchForm.handleSubmit(onCreateBranch)} className="max-w-2xl space-y-4">
            <UIImageUpload label="Branch Logo" value={newBranchForm.watch('logo_url') || ''} onChange={(url) => newBranchForm.setValue('logo_url', url)} />
            <div className="grid grid-cols-2 gap-4">
              <UIInput label="Branch Name *" required {...newBranchForm.register('name')} />
              <UIInput label="Phone" {...newBranchForm.register('phone')} />
              <UIInput label="Address" {...newBranchForm.register('address')} />
              <UIInput label="Email" type="email" {...newBranchForm.register('email')} />
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                <UserRound className="h-4 w-4 text-blue-600" /> Branch User
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <UIInput
                    label="Full Name *"
                    required
                    {...newBranchForm.register('manager_full_name')}
                    error={newBranchForm.formState.errors.manager_full_name?.message}
                  />
                </div>
                <UIInput
                  label="Email *"
                  type="email"
                  required
                  {...newBranchForm.register('manager_email')}
                  error={newBranchForm.formState.errors.manager_email?.message}
                />
                <UIInput
                  label="Password *"
                  type="password"
                  required
                  {...newBranchForm.register('manager_password')}
                  error={newBranchForm.formState.errors.manager_password?.message}
                />
                <div className="col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Role *</label>
                  <select
                    {...newBranchForm.register('manager_role')}
                    defaultValue=""
                    className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
                  >
                    <option value="" disabled>Select role</option>
                    <option value="cashier">Cashier</option>
                    <option value="staff">Staff</option>
                    <option value="branch_manager">Branch Manager</option>
                  </select>
                  {newBranchForm.formState.errors.manager_role && (
                    <p className="mt-1 text-xs text-red-500">{newBranchForm.formState.errors.manager_role.message}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <UIButton type="submit" size="sm" loading={newBranchForm.formState.isSubmitting}>Create Branch</UIButton>
              <UIButton type="button" size="sm" variant="outline" onClick={() => { setShowNewBranchForm(false); setBranchCreateError(null) }}>Cancel</UIButton>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
        {branchList.map((branch) => (
          <div
            key={branch.id}
            className="group relative rounded-xl border border-gray-100 bg-gray-50/60 p-5 transition-all duration-200 hover:border-brand-teal/30 hover:bg-white hover:shadow-md"
          >
            {editBranchId === branch.id ? (
              <form onSubmit={branchForm.handleSubmit(onSaveBranch)} className="space-y-3">
                <UIImageUpload label="Branch Logo" value={branchForm.watch('logo_url') || ''} onChange={(url) => branchForm.setValue('logo_url', url)} />
                <div className="grid grid-cols-2 gap-3">
                  <UIInput label="Branch Name" required {...branchForm.register('name')} />
                  <UIInput label="Phone" {...branchForm.register('phone')} />
                </div>
                <UIInput label="Address" {...branchForm.register('address')} />
                <UIInput label="Email" type="email" {...branchForm.register('email')} />

                {/* Associated users — editable */}
                {branch.profiles && branch.profiles.length > 0 && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <UserRound className="h-3.5 w-3.5" /> Associated Users
                    </p>
                    <div className="space-y-3">
                      {branch.profiles.map((user) => {
                        const edit = userEdits[user.id] ?? { full_name: user.full_name ?? '', role: user.role, saving: false }
                        return (
                          <div key={user.id} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                            <div className="mb-3 flex items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-teal/10">
                                {user.avatar_url ? (
                                  <img src={user.avatar_url} alt={user.full_name ?? ''} className="h-full w-full object-cover" />
                                ) : (
                                  <span className="text-xs font-bold text-brand-teal">
                                    {(user.full_name ?? user.email ?? '?').charAt(0).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                <Mail className="h-3 w-3 shrink-0" />
                                <span className="truncate">{user.email ?? '—'}</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <UIInput
                                label="Full Name"
                                value={edit.full_name}
                                onChange={(e) => setUserEdits((prev) => ({ ...prev, [user.id]: { ...prev[user.id], full_name: e.target.value } }))}
                              />
                              <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
                                <select
                                  value={edit.role}
                                  onChange={(e) => setUserEdits((prev) => ({ ...prev, [user.id]: { ...prev[user.id], role: e.target.value } }))}
                                  className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/20"
                                >
                                  <option value="cashier">Cashier</option>
                                  <option value="staff">Staff</option>
                                  <option value="branch_manager">Branch Manager</option>
                                </select>
                              </div>
                            </div>
                            <div className="mt-2 flex justify-end">
                              <button
                                type="button"
                                disabled={edit.saving}
                                onClick={() => saveUser(user.id)}
                                className="flex items-center gap-1.5 rounded-lg bg-brand-teal px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-teal/80 disabled:opacity-60"
                              >
                                {edit.saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                Save User
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <UIButton type="submit" size="sm" loading={branchForm.formState.isSubmitting}>Save</UIButton>
                  <UIButton type="button" size="sm" variant="outline" onClick={() => setEditBranchId(null)}>Cancel</UIButton>
                </div>
              </form>
            ) : (
              <>
                {/* Avatar + Main badge */}
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-teal/20 to-brand-teal/5 shadow-sm">
                    {branch.logo_url ? (
                      <img src={branch.logo_url} alt={branch.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-lg font-bold text-brand-teal">
                        {branch.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  {(branch as any).is_main && (
                    <span className="rounded-full bg-brand-teal/10 px-2.5 py-1 text-xs font-semibold text-brand-teal">Main</span>
                  )}
                </div>

                {/* Branch name */}
                <p className="mb-3 font-semibold text-gray-900">{branch.name}</p>

                {/* Contact info */}
                <div className="space-y-1.5">
                  {branch.address && (
                    <div className="flex items-start gap-2 text-xs text-gray-500">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="leading-snug">{branch.address}</span>
                    </div>
                  )}
                  {branch.phone && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span>{branch.phone}</span>
                    </div>
                  )}
                </div>

                {/* Edit button — always visible */}
                <button
                  onClick={() => startEditBranch(branch as Branch)}
                  className="absolute right-4 top-4 flex items-center gap-1.5 rounded-lg bg-brand-teal px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all duration-150 hover:bg-brand-teal/80"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
