'use client'
import { useState, useEffect } from 'react'
import { Save, Wrench, ChevronRight, GitBranch, Users, Star, Bell, Calendar, Plus } from 'lucide-react'
import Link from 'next/link'
import * as Tabs from '@radix-ui/react-tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/auth.store'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'

const businessSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().default('GBP'),
  timezone: z.string().default('Europe/London'),
})

type BusinessFormData = z.infer<typeof businessSchema>

interface Branch {
  id: string; name: string; address: string | null; phone: string | null; email: string | null; is_active: boolean
}
interface UserRow {
  id: string; full_name: string | null; email: string; role: string; is_active: boolean
  branches?: { name: string } | null
}

const branchSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
})

const userInviteSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  role: z.enum(['cashier', 'staff', 'branch_manager']),
  branch_id: z.string().uuid(),
})

type BranchFormData = z.infer<typeof branchSchema>
type UserInviteFormData = z.infer<typeof userInviteSchema>

export default function SettingsPage() {
  const { activeBranch, branches, isOwner, setCurrency, setBranches: setStoreBranches } = useAuthStore()
  const [activeTab, setActiveTab] = useState('general')
  const [branchList, setBranchList] = useState<Branch[]>(branches as Branch[])
  const [users, setUsers] = useState<UserRow[]>([])
  const [savedBusiness, setSavedBusiness] = useState(false)
  const [editBranchId, setEditBranchId] = useState<string | null>(null)
  const [showNewBranchForm, setShowNewBranchForm] = useState(false)

  const businessForm = useForm<BusinessFormData>({ resolver: zodResolver(businessSchema) })
  const branchForm = useForm<BranchFormData>({ resolver: zodResolver(branchSchema) })
  const newBranchForm = useForm<BranchFormData>({ resolver: zodResolver(branchSchema) })
  const userForm = useForm<UserInviteFormData>({ resolver: zodResolver(userInviteSchema) })

  useEffect(() => {
    async function fetchBusinessInfo() {
      const res = await fetch('/api/settings/business')
      const json = await res.json()
      if (json.data) {
        businessForm.reset({
          name: json.data.name ?? '',
          email: json.data.email ?? '',
          phone: json.data.phone ?? '',
          country: json.data.country ?? '',
          currency: json.data.currency ?? 'GBP',
          timezone: json.data.timezone ?? 'Europe/London',
        })
      }
    }
    async function fetchUsers() {
      const res = await fetch('/api/users')
      const json = await res.json()
      setUsers(json.data ?? [])
    }
    fetchBusinessInfo()
    if (isOwner()) fetchUsers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onSaveBusiness(data: BusinessFormData) {
    await fetch('/api/settings/business', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (data.currency) setCurrency(data.currency)
    setSavedBusiness(true)
    setTimeout(() => setSavedBusiness(false), 2000)
  }

  async function refreshBranches() {
    const res = await fetch('/api/settings/branches')
    const json = await res.json()
    const updated = json.data ?? []
    setBranchList(updated)
    setStoreBranches(updated)
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
    const res = await fetch('/api/settings/branches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      newBranchForm.reset()
      setShowNewBranchForm(false)
      refreshBranches()
    }
  }

  async function onInviteUser(data: UserInviteFormData) {
    const res = await fetch('/api/users/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) { userForm.reset(); const json = await res.json(); setUsers((u) => [...u, json.data]) }
  }

  function startEditBranch(branch: Branch) {
    setEditBranchId(branch.id)
    branchForm.reset({ name: branch.name, address: branch.address ?? '', phone: branch.phone ?? '', email: branch.email ?? '' })
  }

  const ROLE_LABELS: Record<string, string> = {
    cashier: 'Cashier',
    staff: 'Staff',
    branch_manager: 'Branch Manager',
    business_owner: 'Business Owner',
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Manage your business configuration</p>
      </div>

      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
          <Tabs.Trigger value="general" className="rounded-md px-4 py-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
            General
          </Tabs.Trigger>
          {isOwner() && (
            <>
              <Tabs.Trigger value="branches" className="rounded-md px-4 py-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
                Branches
              </Tabs.Trigger>
              <Tabs.Trigger value="users" className="rounded-md px-4 py-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
                Users
              </Tabs.Trigger>
            </>
          )}
        </Tabs.List>

        {/* General settings */}
        <Tabs.Content value="general" className="mt-4">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 font-semibold text-gray-900">Business Information</h3>
            <form onSubmit={businessForm.handleSubmit(onSaveBusiness)} className="space-y-4 max-w-lg">
              <Input label="Business Name" required {...businessForm.register('name')} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Email" type="email" {...businessForm.register('email')} />
                <Input label="Phone" {...businessForm.register('phone')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Currency</label>
                  <select {...businessForm.register('currency')} className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm">
                    <option value="GBP">GBP (£)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="AED">AED (د.إ)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Timezone</label>
                  <select {...businessForm.register('timezone')} className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm">
                    <option value="Europe/London">Europe/London</option>
                    <option value="America/New_York">America/New_York</option>
                    <option value="America/Los_Angeles">America/Los_Angeles</option>
                    <option value="Asia/Dubai">Asia/Dubai</option>
                    <option value="Asia/Karachi">Asia/Karachi</option>
                  </select>
                </div>
              </div>
              <Button type="submit" loading={businessForm.formState.isSubmitting}>
                <Save className="h-4 w-4" />
                {savedBusiness ? 'Saved!' : 'Save Changes'}
              </Button>
            </form>
          </div>

          {/* Quick links */}
          <div className="mt-4 rounded-xl border border-gray-200 bg-white divide-y">
            <div className="px-6 py-3">
              <h3 className="font-semibold text-gray-900 text-sm">Configuration</h3>
            </div>
            <Link
              href="/settings/services"
              className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Wrench className="h-4 w-4 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-800">Service Catalogue</p>
                  <p className="text-xs text-gray-400">Manage manufacturers, devices, and repair services</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
            </Link>
            <Link
              href="/settings/workflows"
              className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <GitBranch className="h-4 w-4 text-purple-600" />
                <div>
                  <p className="text-sm font-medium text-gray-800">Workflows &amp; Responses</p>
                  <p className="text-xs text-gray-400">Custom workflows, status flags, and canned responses</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
            </Link>
            <Link
              href="/settings/customer-groups"
              className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-indigo-600" />
                <div>
                  <p className="text-sm font-medium text-gray-800">Customer Groups</p>
                  <p className="text-xs text-gray-400">Segment customers for pricing, discounts, and billing</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
            </Link>
            <Link
              href="/settings/loyalty"
              className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Star className="h-4 w-4 text-yellow-500" />
                <div>
                  <p className="text-sm font-medium text-gray-800">Loyalty Programme</p>
                  <p className="text-xs text-gray-400">Configure points earn &amp; redeem rates</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
            </Link>
            <Link
              href="/settings/notifications"
              className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Bell className="h-4 w-4 text-orange-500" />
                <div>
                  <p className="text-sm font-medium text-gray-800">Notifications</p>
                  <p className="text-xs text-gray-400">Email &amp; SMS templates, gateway config, and invoice reminders</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
            </Link>
            <Link
              href="/settings/booking"
              className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-teal-500" />
                <div>
                  <p className="text-sm font-medium text-gray-800">Online Booking</p>
                  <p className="text-xs text-gray-400">Business hours, booking widget, and availability settings</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
            </Link>
          </div>
        </Tabs.Content>

        {/* Branches */}
        <Tabs.Content value="branches" className="mt-4 space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 className="font-semibold text-gray-900">Branches</h3>
              <Button size="sm" onClick={() => { setShowNewBranchForm(true); newBranchForm.reset() }}>
                <Plus className="h-4 w-4" /> Add Branch
              </Button>
            </div>

            {/* New branch form */}
            {showNewBranchForm && (
              <div className="border-b border-gray-100 bg-blue-50/40 px-4 py-4">
                <p className="mb-3 text-sm font-semibold text-gray-700">New Branch</p>
                <form onSubmit={newBranchForm.handleSubmit(onCreateBranch)} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Branch Name *" required {...newBranchForm.register('name')} />
                    <Input label="Phone" {...newBranchForm.register('phone')} />
                  </div>
                  <Input label="Address" {...newBranchForm.register('address')} />
                  <Input label="Email" type="email" {...newBranchForm.register('email')} />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" loading={newBranchForm.formState.isSubmitting}>Create Branch</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setShowNewBranchForm(false)}>Cancel</Button>
                  </div>
                </form>
              </div>
            )}

            <div className="divide-y divide-gray-100">
              {branchList.map((branch) => (
                <div key={branch.id} className="px-4 py-4">
                  {editBranchId === branch.id ? (
                    <form onSubmit={branchForm.handleSubmit(onSaveBranch)} className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Input label="Branch Name" required {...branchForm.register('name')} />
                        <Input label="Phone" {...branchForm.register('phone')} />
                      </div>
                      <Input label="Address" {...branchForm.register('address')} />
                      <Input label="Email" type="email" {...branchForm.register('email')} />
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" loading={branchForm.formState.isSubmitting}>Save</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditBranchId(null)}>Cancel</Button>
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
                      <Button size="sm" variant="outline" onClick={() => startEditBranch(branch as Branch)}>
                        Edit
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Tabs.Content>

        {/* Users */}
        <Tabs.Content value="users" className="mt-4 space-y-4">
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
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 font-semibold text-gray-900">Invite Team Member</h3>
            <form onSubmit={userForm.handleSubmit(onInviteUser)} className="space-y-3 max-w-md">
              <Input label="Full Name" required {...userForm.register('full_name')} />
              <Input label="Email" type="email" required {...userForm.register('email')} />
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
              <Button type="submit" loading={userForm.formState.isSubmitting}>Send Invite</Button>
            </form>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
