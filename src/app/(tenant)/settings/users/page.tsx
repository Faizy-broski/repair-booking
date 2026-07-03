'use client'
import { useState, useEffect } from 'react'
import { KeyRound, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/auth.store'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'

interface UserRow {
  id: string; full_name: string | null; email: string; role: string; is_active: boolean
  phone?: string | null; branch_id?: string | null
  branches?: { name: string } | null
}

const resetPwSchema = z.object({
  password: z.string().min(6, 'Min. 6 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })
type ResetPwForm = z.infer<typeof resetPwSchema>

const editUserSchema = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  phone: z.string().optional(),
  role: z.enum(['cashier', 'staff', 'branch_manager']),
  branch_id: z.string().uuid().optional().or(z.literal('')),
  is_active: z.boolean(),
})
type EditUserForm = z.infer<typeof editUserSchema>

const userCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(1),
  role: z.enum(['cashier', 'staff', 'branch_manager']),
  branch_id: z.string().uuid(),
})
type UserCreateFormData = z.infer<typeof userCreateSchema>

const ROLE_LABELS: Record<string, string> = {
  cashier: 'Cashier',
  staff: 'Staff',
  branch_manager: 'Branch Manager',
  business_owner: 'Business Owner',
}

export default function UsersSettingsPage() {
  const { isOwner, branches } = useAuthStore()
  const [users, setUsers] = useState<UserRow[]>([])
  const [userCreateError, setUserCreateError] = useState<string | null>(null)
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [editTarget, setEditTarget] = useState<UserRow | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const userForm = useForm<UserCreateFormData>({ resolver: zodResolver(userCreateSchema) })
  const resetPwForm = useForm<ResetPwForm>({ resolver: zodResolver(resetPwSchema) })
  const editForm = useForm<EditUserForm>({ resolver: zodResolver(editUserSchema) })

  useEffect(() => {
    async function fetchUsers() {
      const res = await fetch('/api/users')
      const json = await res.json()
      setUsers(json.data ?? [])
    }
    if (isOwner()) fetchUsers()
  }, [isOwner])

  async function onResetPassword(data: ResetPwForm) {
    if (!resetTarget) return
    setResetError(null)
    const res = await fetch(`/api/users/${resetTarget.id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: data.password }),
    })
    const json = await res.json() as { error?: { message?: string } | string }
    if (!res.ok) {
      const msg = typeof json.error === 'string' ? json.error : json.error?.message ?? 'Failed to update password'
      setResetError(msg)
      return
    }
    setResetSuccess(true)
    resetPwForm.reset()
  }

  function openEditModal(user: UserRow) {
    setEditTarget(user)
    setEditError(null)
    editForm.reset({
      full_name: user.full_name ?? '',
      phone: user.phone ?? '',
      role: user.role as EditUserForm['role'],
      branch_id: user.branch_id ?? '',
      is_active: user.is_active,
    })
  }

  async function onEditUser(data: EditUserForm) {
    if (!editTarget) return
    setEditError(null)
    const res = await fetch(`/api/users/${editTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, branch_id: data.branch_id || null }),
    })
    const json = await res.json() as { data?: UserRow; error?: { message?: string } | string }
    if (!res.ok) {
      const msg = typeof json.error === 'string' ? json.error : json.error?.message ?? 'Failed to update user'
      setEditError(msg)
      return
    }
    setUsers((list) => list.map((u) => (u.id === editTarget.id ? { ...u, ...json.data } : u)))
    setEditTarget(null)
  }

  async function onCreateUser(data: UserCreateFormData) {
    setUserCreateError(null)
    const res = await fetch('/api/users/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) { 
      userForm.reset()
      const json = await res.json()
      setUsers((u) => [...u, json.data]) 
    } else { 
      const j = await res.json()
      setUserCreateError(j?.error?.message ?? 'Failed to create user.') 
    }
  }

  if (!isOwner()) return <div className="p-8 text-center text-gray-500">Only business owners can manage users.</div>

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h3 className="font-semibold text-gray-900">Team Members</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium text-gray-900">{user.full_name ?? user.email}</p>
                <p className="text-xs text-gray-400">{user.email} · {ROLE_LABELS[user.role] ?? user.role}</p>
              </div>
              <div className="flex items-center gap-2">
                {user.role !== 'business_owner' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Edit profile"
                    onClick={() => openEditModal(user)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                {user.role !== 'business_owner' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Set password"
                    onClick={() => { setResetTarget(user); setResetError(null); setResetSuccess(false); resetPwForm.reset() }}
                  >
                    <KeyRound className="h-4 w-4" />
                  </Button>
                )}
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {user.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="mb-4 font-semibold text-gray-900">Create Team Member Account</h3>
        {userCreateError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{userCreateError}</div>
        )}
        <form onSubmit={userForm.handleSubmit(onCreateUser)} className="space-y-3 max-w-md">
          <Input label="Full Name" required {...userForm.register('full_name')} />
          <Input label="Email" type="email" required {...userForm.register('email')} />
          <Input label="Password" type="password" required {...userForm.register('password')} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
              <select {...userForm.register('role')} className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm">
                <option value="cashier">Cashier</option>
                <option value="staff">Staff</option>
                <option value="branch_manager">Branch Manager</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Branch</label>
              <select {...userForm.register('branch_id')} className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm">
                <option value="">Select branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
          <Button type="submit" loading={userForm.formState.isSubmitting}>Create Account</Button>
        </form>
      </div>

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h2 className="font-semibold text-gray-900">Set password</h2>
                <p className="mt-0.5 text-xs text-gray-500">{resetTarget.full_name ?? resetTarget.email}</p>
              </div>
              <button
                onClick={() => { setResetTarget(null); setResetError(null); setResetSuccess(false) }}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">
              {resetSuccess ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                    <p className="font-semibold">Password updated</p>
                    <p className="mt-0.5 text-xs">They can now sign in with the new password.</p>
                  </div>
                  <Button className="w-full" variant="outline" onClick={() => { setResetTarget(null); setResetSuccess(false) }}>Done</Button>
                </div>
              ) : (
                <form onSubmit={resetPwForm.handleSubmit(onResetPassword)} className="space-y-4">
                  {resetError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{resetError}</div>
                  )}
                  <Input
                    label="New password"
                    type="password"
                    placeholder="Min. 6 characters"
                    autoComplete="new-password"
                    error={resetPwForm.formState.errors.password?.message}
                    {...resetPwForm.register('password')}
                  />
                  <Input
                    label="Confirm new password"
                    type="password"
                    placeholder="Repeat password"
                    autoComplete="new-password"
                    error={resetPwForm.formState.errors.confirmPassword?.message}
                    {...resetPwForm.register('confirmPassword')}
                  />
                  <Button type="submit" className="w-full" loading={resetPwForm.formState.isSubmitting}>
                    Set password
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h2 className="font-semibold text-gray-900">Edit team member</h2>
                <p className="mt-0.5 text-xs text-gray-500">{editTarget.full_name ?? editTarget.email}</p>
              </div>
              <button
                onClick={() => { setEditTarget(null); setEditError(null) }}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">
              <form onSubmit={editForm.handleSubmit(onEditUser)} className="space-y-4">
                {editError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{editError}</div>
                )}
                <Input
                  label="Full Name"
                  error={editForm.formState.errors.full_name?.message}
                  {...editForm.register('full_name')}
                />
                <Input
                  label="Phone"
                  error={editForm.formState.errors.phone?.message}
                  {...editForm.register('phone')}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
                    <select {...editForm.register('role')} className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm">
                      <option value="cashier">Cashier</option>
                      <option value="staff">Staff</option>
                      <option value="branch_manager">Branch Manager</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Branch</label>
                    <select {...editForm.register('branch_id')} className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm">
                      <option value="">Select branch</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" className="h-4 w-4 rounded border-gray-300" {...editForm.register('is_active')} />
                  Active
                </label>
                <Button type="submit" className="w-full" loading={editForm.formState.isSubmitting}>
                  Save changes
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
