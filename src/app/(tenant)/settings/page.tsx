'use client'
import { useState, useEffect } from 'react'
import { Save, Wrench, ChevronRight, ChevronDown, GitBranch, Users, Star, Bell, Calendar, Plus, Code2, Sliders, Pencil, Trash2, Tag, Package, Check, X, Cpu } from 'lucide-react'
import { CustomFieldBuilder } from '@/components/shared/custom-field-builder'
import Link from 'next/link'
import * as Tabs from '@radix-ui/react-tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ImageUpload } from '@/components/ui/image-upload'
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
  logo_url?: string | null
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
  logo_url: z.string().url().optional().or(z.literal('')),
})
const userCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(1),
  role: z.enum(['cashier', 'staff', 'branch_manager']),
  branch_id: z.string().uuid(),
})
type BranchFormData = z.infer<typeof branchSchema>
type UserCreateFormData = z.infer<typeof userCreateSchema>
export default function SettingsPage() {
  const { activeBranch, branches, isOwner, setCurrency, setBranches: setStoreBranches } = useAuthStore()
  const [activeTab, setActiveTab] = useState('general')
  const [branchList, setBranchList] = useState<Branch[]>(branches as Branch[])
  const [users, setUsers] = useState<UserRow[]>([])
  const [savedBusiness, setSavedBusiness] = useState(false)
  const [editBranchId, setEditBranchId] = useState<string | null>(null)
  const [showNewBranchForm, setShowNewBranchForm] = useState(false)
  const [branchCreateError, setBranchCreateError] = useState<string | null>(null)
  // Catalogue — Device Type → Brand → Model → Part Types
  interface CatBrand    { id: string; name: string; category_id: string | null; image_url?: string | null }
  interface CatModel    { id: string; name: string; brand_id: string | null; manufacturer_id: string | null; image_url?: string | null }
  interface CatPartType { id: string; name: string; device_id: string | null; image_url?: string | null }
  interface CatCategory { id: string; name: string; image_url?: string | null }
  const [categories, setCategories] = useState<CatCategory[]>([])
  const [brands, setBrands] = useState<CatBrand[]>([])
  const [models, setModels] = useState<CatModel[]>([])
  const [partTypes, setPartTypes] = useState<CatPartType[]>([])
  const [catalogueSaving, setCatalogueSaving] = useState(false)
  // inline add inputs + images
  const [newTypeName, setNewTypeName]   = useState('')
  const [newTypeImage, setNewTypeImage] = useState('')
  const [newBrandName, setNewBrandName] = useState('')
  const [newBrandImage, setNewBrandImage] = useState('')
  const [newModelName, setNewModelName] = useState('')
  const [newModelImage, setNewModelImage] = useState('')
  const [newPartName, setNewPartName]   = useState('')
  const [newPartImage, setNewPartImage] = useState('')
  // 4-column selection + mobile step
  const [selectedTypeId, setSelectedTypeId]   = useState<string | null>(null)
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [mobileStep, setMobileStep] = useState<0 | 1 | 2 | 3>(0)
  // inline rename
  const [editingTypeId, setEditingTypeId]   = useState<string | null>(null)
  const [editTypeName, setEditTypeName]     = useState('')
  const [editTypeImage, setEditTypeImage]   = useState('')
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null)
  const [editBrandName, setEditBrandName]   = useState('')
  const [editBrandImage, setEditBrandImage] = useState('')
  const [editingModelId, setEditingModelId] = useState<string | null>(null)
  const [editModelName, setEditModelName]   = useState('')
  const [editModelImage, setEditModelImage] = useState('')
  const [editingPartId, setEditingPartId]   = useState<string | null>(null)
  const [editPartName, setEditPartName]     = useState('')
  const [editPartImage, setEditPartImage]   = useState('')
  async function loadCatalogue() {
    const [cRes, bRes, mRes, pRes] = await Promise.all([
      fetch('/api/categories'), fetch('/api/brands'),
      fetch('/api/services/devices'), fetch('/api/part-types'),
    ])
    const [cj, bj, mj, pj] = await Promise.all([cRes.json(), bRes.json(), mRes.json(), pRes.json()])
    setCategories(cj.data ?? [])
    setBrands(bj.data ?? [])
    setModels(mj.data ?? [])
    setPartTypes(pj.data ?? [])
  }
  async function addDeviceType() {
    if (!newTypeName.trim()) return
    setCatalogueSaving(true)
    await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newTypeName.trim(), image_url: newTypeImage || null }) })
    setNewTypeName(''); setNewTypeImage('')
    await loadCatalogue()
    setCatalogueSaving(false)
  }
  async function deleteDeviceType(id: string) {
    await fetch(`/api/categories/${id}`, { method: 'DELETE' })
    await loadCatalogue()
  }
  async function addBrand(categoryId: string) {
    if (!newBrandName.trim()) return
    setCatalogueSaving(true)
    await fetch('/api/brands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newBrandName.trim(), category_id: categoryId, image_url: newBrandImage || null }) })
    setNewBrandName(''); setNewBrandImage('')
    await loadCatalogue()
    setCatalogueSaving(false)
  }
  async function deleteBrand(id: string) {
    await fetch(`/api/brands/${id}`, { method: 'DELETE' })
    await loadCatalogue()
  }
  async function addModel(brandId: string) {
    if (!newModelName.trim()) return
    setCatalogueSaving(true)
    // Find or create manufacturer matching brand name
    const brand = brands.find(b => b.id === brandId)
    let manufacturerId: string | null = null
    if (brand) {
      const mfRes = await fetch('/api/services/manufacturers')
      const mfJson = await mfRes.json()
      let mf = (mfJson.data ?? []).find((m: { name: string }) => m.name === brand.name)
      if (!mf) {
        const createRes = await fetch('/api/services/manufacturers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: brand.name }) })
        if (createRes.ok) mf = (await createRes.json()).data
      }
      if (mf) manufacturerId = mf.id
    }
    await fetch('/api/services/devices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newModelName.trim(), brand_id: brandId, manufacturer_id: manufacturerId, image_url: newModelImage || null }),
    })
    setNewModelName(''); setNewModelImage('')
    await loadCatalogue()
    setCatalogueSaving(false)
  }
  async function deleteModel(id: string) {
    await fetch(`/api/services/devices/${id}`, { method: 'DELETE' })
    await loadCatalogue()
  }
  async function addPartType(deviceId: string) {
    if (!newPartName.trim()) return
    setCatalogueSaving(true)
    await fetch('/api/part-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newPartName.trim(), device_id: deviceId, image_url: newPartImage || null }) })
    setNewPartName(''); setNewPartImage('')
    await loadCatalogue()
    setCatalogueSaving(false)
  }
  async function deletePartType(id: string) {
    await fetch(`/api/part-types/${id}`, { method: 'DELETE' })
    await loadCatalogue()
  }
  async function renameDeviceType(id: string) {
    if (!editTypeName.trim()) return
    await fetch(`/api/categories/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editTypeName.trim(), image_url: editTypeImage || null }) })
    setEditingTypeId(null)
    await loadCatalogue()
  }
  async function renameBrand(id: string) {
    if (!editBrandName.trim()) return
    await fetch(`/api/brands/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editBrandName.trim(), image_url: editBrandImage || null }) })
    setEditingBrandId(null)
    await loadCatalogue()
  }
  async function renameModel(id: string) {
    if (!editModelName.trim()) return
    await fetch(`/api/services/devices/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editModelName.trim(), image_url: editModelImage || null }) })
    setEditingModelId(null)
    await loadCatalogue()
  }
  async function renamePartType(id: string) {
    if (!editPartName.trim()) return
    await fetch(`/api/part-types/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editPartName.trim(), image_url: editPartImage || null }) })
    setEditingPartId(null)
    await loadCatalogue()
  }
  const businessForm = useForm<BusinessFormData>({ resolver: zodResolver(businessSchema) })
  const branchForm = useForm<BranchFormData>({ resolver: zodResolver(branchSchema) })
  const newBranchForm = useForm<BranchFormData>({ resolver: zodResolver(branchSchema) })
  const userForm = useForm<UserCreateFormData>({ resolver: zodResolver(userCreateSchema) })
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
    loadCatalogue()
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
  const [userCreateError, setUserCreateError] = useState<string | null>(null)
  async function onCreateUser(data: UserCreateFormData) {
    setUserCreateError(null)
    const res = await fetch('/api/users/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) { userForm.reset(); const json = await res.json(); setUsers((u) => [...u, json.data]) }
    else { const j = await res.json(); setUserCreateError(j?.error?.message ?? 'Failed to create user.') }
  }
  function startEditBranch(branch: Branch) {
    setEditBranchId(branch.id)
    branchForm.reset({ name: branch.name, address: branch.address ?? '', phone: branch.phone ?? '', email: branch.email ?? '', logo_url: branch.logo_url ?? '' })
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
        <Tabs.List className="flex gap-2 rounded-xl bg-gray-100/80 p-1.5 border border-gray-200 w-fit">
          <Tabs.Trigger value="general" className="rounded-lg px-5 py-2 text-sm font-medium text-gray-600 transition-all hover:bg-gray-200/50 hover:text-gray-900 data-[state=active]:bg-brand-teal data-[state=active]:text-white data-[state=active]:shadow-md">
            General
          </Tabs.Trigger>
          {isOwner() && (
            <>
              <Tabs.Trigger value="branches" className="rounded-lg px-5 py-2 text-sm font-medium text-gray-600 transition-all hover:bg-gray-200/50 hover:text-gray-900 data-[state=active]:bg-brand-teal data-[state=active]:text-white data-[state=active]:shadow-md">
                Branches
              </Tabs.Trigger>
              <Tabs.Trigger value="users" className="rounded-lg px-5 py-2 text-sm font-medium text-gray-600 transition-all hover:bg-gray-200/50 hover:text-gray-900 data-[state=active]:bg-brand-teal data-[state=active]:text-white data-[state=active]:shadow-md">
                Users
              </Tabs.Trigger>
            </>
          )}
          <Tabs.Trigger value="custom_fields" className="rounded-lg px-5 py-2 text-sm font-medium text-gray-600 transition-all hover:bg-gray-200/50 hover:text-gray-900 data-[state=active]:bg-brand-teal data-[state=active]:text-white data-[state=active]:shadow-md">
            Custom Fields
          </Tabs.Trigger>
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
          </div>
        </Tabs.Content>
        {/* Branches */}
        <Tabs.Content value="branches" className="mt-4 space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 className="font-semibold text-gray-900">Branches</h3>
              <Button size="sm" onClick={() => { setShowNewBranchForm(true); setBranchCreateError(null); newBranchForm.reset() }}>
                <Plus className="h-4 w-4" /> Add Branch
              </Button>
            </div>
            {/* New branch form */}
            {showNewBranchForm && (
              <div className="border-b border-gray-100 bg-blue-50/40 px-4 py-4">
                <p className="mb-3 text-sm font-semibold text-gray-700">New Branch</p>
                {branchCreateError && (
                  <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {branchCreateError}
                  </div>
                )}
                <form onSubmit={newBranchForm.handleSubmit(onCreateBranch)} className="space-y-3">
                  <ImageUpload label="Branch Logo" value={newBranchForm.watch('logo_url') || ''} onChange={(url) => newBranchForm.setValue('logo_url', url)} />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Branch Name *" required {...newBranchForm.register('name')} />
                    <Input label="Phone" {...newBranchForm.register('phone')} />
                  </div>
                  <Input label="Address" {...newBranchForm.register('address')} />
                  <Input label="Email" type="email" {...newBranchForm.register('email')} />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" loading={newBranchForm.formState.isSubmitting}>Create Branch</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => { setShowNewBranchForm(false); setBranchCreateError(null) }}>Cancel</Button>
                  </div>
                </form>
              </div>
            )}
            <div className="divide-y divide-gray-100">
              {branchList.map((branch) => (
                <div key={branch.id} className="px-4 py-4">
                  {editBranchId === branch.id ? (
                    <form onSubmit={branchForm.handleSubmit(onSaveBranch)} className="space-y-3">
                      <ImageUpload label="Branch Logo" value={branchForm.watch('logo_url') || ''} onChange={(url) => branchForm.setValue('logo_url', url)} />
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
        </Tabs.Content>
        {/* Custom Fields */}
        <Tabs.Content value="custom_fields" className="mt-4">
          <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Custom Fields</h3>
                <p className="mt-0.5 text-sm text-gray-500">
                  Add extra fields to repairs, customers, and other records. For repairs, optionally scope fields to a specific repair category (e.g. Phone Repair, Computer Repair) so they only appear on matching tickets.
                </p>
              </div>
              <Sliders className="h-5 w-5 shrink-0 text-brand-teal mt-0.5" />
            </div>
            {/* How it works info */}
            <div className="rounded-lg bg-brand-teal-light border border-brand-teal-light px-4 py-3 text-sm text-brand-teal-dark space-y-1">
              <p className="font-medium">Field Types</p>
              <ul className="list-disc ml-4 space-y-0.5 text-xs text-brand-teal">
                <li><strong>Text</strong> — single-line text input (e.g. Device Color, Special Instructions)</li>
                <li><strong>Text Area</strong> — multi-line text (e.g. Customer Notes, Repair Description)</li>
                <li><strong>Dropdown</strong> — pick from a list (e.g. Priority: Low / Medium / High)</li>
                <li><strong>Checkbox</strong> — yes/no flag (e.g. Under Warranty, Rush Job)</li>
                <li><strong>Number, Date, Phone, Email</strong> — typed inputs with validation</li>
              </ul>
            </div>
            <CustomFieldBuilder />
          </div>
        </Tabs.Content>
        {/* Catalogue moved to /inventory/catalogue */}
        {false && <Tabs.Content value="catalogue" className="mt-4">
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-200">
              <Smartphone className="h-5 w-5 text-brand-teal shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 text-sm leading-none">Device Catalogue</h3>
                <p className="text-xs text-gray-400 mt-0.5">Types → Brands → Models → Part Types</p>
              </div>
            </div>
            {/* Mobile breadcrumb stepper */}
            <div className="lg:hidden border-b border-gray-100 px-4 py-2 bg-gray-50 flex items-center gap-1 flex-wrap">
              <button onClick={() => setMobileStep(0)} className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${mobileStep === 0 ? 'bg-brand-teal text-white' : 'text-gray-500 hover:text-gray-700'}`}>Types</button>
              {selectedTypeId && (<>
                <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" />
                <button onClick={() => setMobileStep(1)} className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${mobileStep === 1 ? 'bg-brand-teal text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                  {categories.find(c => c.id === selectedTypeId)?.name ?? 'Brands'}
                </button>
              </>)}
              {selectedBrandId && (<>
                <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" />
                <button onClick={() => setMobileStep(2)} className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${mobileStep === 2 ? 'bg-brand-teal text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                  {brands.find(b => b.id === selectedBrandId)?.name ?? 'Models'}
                </button>
              </>)}
              {selectedModelId && (<>
                <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" />
                <button onClick={() => setMobileStep(3)} className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${mobileStep === 3 ? 'bg-brand-teal text-white' : 'text-gray-500 hover:text-gray-700'}`}>Parts</button>
              </>)}
            </div>
            {/* 4-column explorer (desktop) / single active column (mobile) */}
            <div className="lg:grid lg:grid-cols-4 lg:divide-x lg:divide-gray-200" style={{ minHeight: 460 }}>
              {/* ── Col 1: Device Types ── */}
              <div className={`flex flex-col border-b lg:border-b-0 border-gray-200 ${mobileStep !== 0 ? 'hidden lg:flex' : 'flex'}`}>
                <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Device Types</span>
                  <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-1.5">{categories.length}</span>
                </div>
                <div className="px-3 py-2 border-b border-gray-100 space-y-1.5">
                  <div className="flex gap-1.5 items-center">
                    <ImageUpload compact value={newTypeImage} onChange={setNewTypeImage} />
                    <input type="text" placeholder="e.g. Phones, Laptops…" value={newTypeName}
                      onChange={e => setNewTypeName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addDeviceType()}
                      className="h-8 flex-1 min-w-0 rounded-md border border-gray-200 px-2.5 text-sm focus:border-brand-teal focus:outline-none" />
                    <button onClick={addDeviceType} disabled={catalogueSaving || !newTypeName.trim()}
                      className="h-8 px-3 rounded-md bg-brand-teal text-white text-xs font-medium hover:bg-brand-teal/90 disabled:opacity-40 flex items-center gap-1 shrink-0">
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {categories.length === 0 && <p className="text-xs text-gray-400 text-center py-10">No device types yet</p>}
                  {categories.map(dt => {
                    const isSelected = selectedTypeId === dt.id
                    const isEditing = editingTypeId === dt.id
                    return (
                      <div key={dt.id}
                        onClick={() => { if (!isEditing) { setSelectedTypeId(dt.id); setSelectedBrandId(null); setSelectedModelId(null); setMobileStep(1) } }}
                        className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-gray-50 last:border-b-0 transition-colors ${isSelected ? 'bg-teal-50 border-l-[3px] border-l-brand-teal' : 'hover:bg-gray-50 border-l-[3px] border-l-transparent'}`}>
                        {dt.image_url
                          ? <img src={dt.image_url} alt={dt.name} className="h-5 w-5 rounded object-cover shrink-0" />
                          : <Smartphone className="h-3.5 w-3.5 text-brand-teal shrink-0" />}
                        {isEditing ? (
                          <>
                            <ImageUpload compact value={editTypeImage} onChange={setEditTypeImage} className="shrink-0" />
                            <input autoFocus value={editTypeName}
                              onChange={e => setEditTypeName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') renameDeviceType(dt.id); if (e.key === 'Escape') setEditingTypeId(null) }}
                              onClick={e => e.stopPropagation()}
                              className="flex-1 h-7 min-w-0 rounded border border-brand-teal px-2 text-sm focus:outline-none" />
                            <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                              <button onClick={() => renameDeviceType(dt.id)} className="p-1 rounded text-green-600 hover:bg-green-50"><Check className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setEditingTypeId(null)} className="p-1 rounded text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm text-gray-800 truncate">{dt.name}</span>
                            <span className="text-[11px] text-gray-400 shrink-0 mr-1">{brands.filter(b => b.category_id === dt.id).length}</span>
                            <div className="flex gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                              <button onClick={() => { setEditingTypeId(dt.id); setEditTypeName(dt.name); setEditTypeImage(dt.image_url ?? '') }} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"><Pencil className="h-3 w-3" /></button>
                              <button onClick={() => deleteDeviceType(dt.id)} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="h-3 w-3" /></button>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
              {/* ── Col 2: Brands ── */}
              <div className={`flex flex-col border-b lg:border-b-0 border-gray-200 ${mobileStep !== 1 ? 'hidden lg:flex' : 'flex'}`}>
                <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Brands</span>
                  {selectedTypeId && <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-1.5">{brands.filter(b => b.category_id === selectedTypeId).length}</span>}
                </div>
                {!selectedTypeId ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6 py-10">
                    <Tag className="h-9 w-9 text-gray-200" />
                    <p className="text-xs text-gray-400">Select a device type first</p>
                  </div>
                ) : (
                  <>
                    <div className="px-3 py-2 border-b border-gray-100">
                      <div className="flex gap-1.5 items-center">
                        <ImageUpload compact value={newBrandImage} onChange={setNewBrandImage} />
                        <input type="text" placeholder="e.g. Apple, Samsung…" value={newBrandName}
                          onChange={e => setNewBrandName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addBrand(selectedTypeId)}
                          className="h-8 flex-1 min-w-0 rounded-md border border-gray-200 px-2.5 text-sm focus:border-brand-teal focus:outline-none" />
                        <button onClick={() => addBrand(selectedTypeId)} disabled={catalogueSaving || !newBrandName.trim()}
                          className="h-8 px-3 rounded-md bg-brand-teal text-white text-xs font-medium hover:bg-brand-teal/90 disabled:opacity-40 flex items-center gap-1 shrink-0">
                          <Plus className="h-3.5 w-3.5" /> Add
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {brands.filter(b => b.category_id === selectedTypeId).length === 0 && <p className="text-xs text-gray-400 text-center py-10">No brands yet</p>}
                      {brands.filter(b => b.category_id === selectedTypeId).map(brand => {
                        const isSelected = selectedBrandId === brand.id
                        const isEditing = editingBrandId === brand.id
                        return (
                          <div key={brand.id}
                            onClick={() => { if (!isEditing) { setSelectedBrandId(brand.id); setSelectedModelId(null); setMobileStep(2) } }}
                            className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-gray-50 last:border-b-0 transition-colors ${isSelected ? 'bg-teal-50 border-l-[3px] border-l-brand-teal' : 'hover:bg-gray-50 border-l-[3px] border-l-transparent'}`}>
                            {brand.image_url
                              ? <img src={brand.image_url} alt={brand.name} className="h-5 w-5 rounded object-contain shrink-0" />
                              : <Tag className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                            {isEditing ? (
                              <>
                                <ImageUpload compact value={editBrandImage} onChange={setEditBrandImage} className="shrink-0" />
                                <input autoFocus value={editBrandName}
                                  onChange={e => setEditBrandName(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') renameBrand(brand.id); if (e.key === 'Escape') setEditingBrandId(null) }}
                                  onClick={e => e.stopPropagation()}
                                  className="flex-1 h-7 min-w-0 rounded border border-brand-teal px-2 text-sm focus:outline-none" />
                                <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => renameBrand(brand.id)} className="p-1 rounded text-green-600 hover:bg-green-50"><Check className="h-3.5 w-3.5" /></button>
                                  <button onClick={() => setEditingBrandId(null)} className="p-1 rounded text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
                                </div>
                              </>
                            ) : (
                              <>
                                <span className="flex-1 text-sm text-gray-800 truncate">{brand.name}</span>
                                <span className="text-[11px] text-gray-400 shrink-0 mr-1">{models.filter(m => m.brand_id === brand.id).length}</span>
                                <div className="flex gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => { setEditingBrandId(brand.id); setEditBrandName(brand.name); setEditBrandImage(brand.image_url ?? '') }} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"><Pencil className="h-3 w-3" /></button>
                                  <button onClick={() => deleteBrand(brand.id)} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="h-3 w-3" /></button>
                                </div>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
              {/* ── Col 3: Models ── */}
              <div className={`flex flex-col border-b lg:border-b-0 border-gray-200 ${mobileStep !== 2 ? 'hidden lg:flex' : 'flex'}`}>
                <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Models</span>
                  {selectedBrandId && <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-1.5">{models.filter(m => m.brand_id === selectedBrandId).length}</span>}
                </div>
                {!selectedBrandId ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6 py-10">
                    <Package className="h-9 w-9 text-gray-200" />
                    <p className="text-xs text-gray-400">Select a brand first</p>
                  </div>
                ) : (
                  <>
                    <div className="px-3 py-2 border-b border-gray-100">
                      <div className="flex gap-1.5 items-center">
                        <ImageUpload compact value={newModelImage} onChange={setNewModelImage} />
                        <input type="text" placeholder="e.g. iPhone 15, Galaxy S24…" value={newModelName}
                          onChange={e => setNewModelName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addModel(selectedBrandId)}
                          className="h-8 flex-1 min-w-0 rounded-md border border-gray-200 px-2.5 text-sm focus:border-brand-teal focus:outline-none" />
                        <button onClick={() => addModel(selectedBrandId)} disabled={catalogueSaving || !newModelName.trim()}
                          className="h-8 px-3 rounded-md bg-brand-teal text-white text-xs font-medium hover:bg-brand-teal/90 disabled:opacity-40 flex items-center gap-1 shrink-0">
                          <Plus className="h-3.5 w-3.5" /> Add
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {models.filter(m => m.brand_id === selectedBrandId).length === 0 && <p className="text-xs text-gray-400 text-center py-10">No models yet</p>}
                      {models.filter(m => m.brand_id === selectedBrandId).map(model => {
                        const isSelected = selectedModelId === model.id
                        const isEditing = editingModelId === model.id
                        const partCount = partTypes.filter(p => p.device_id === model.id).length
                        return (
                          <div key={model.id}
                            onClick={() => { if (!isEditing) { setSelectedModelId(model.id); setMobileStep(3) } }}
                            className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-gray-50 last:border-b-0 transition-colors ${isSelected ? 'bg-teal-50 border-l-[3px] border-l-brand-teal' : 'hover:bg-gray-50 border-l-[3px] border-l-transparent'}`}>
                            {model.image_url
                              ? <img src={model.image_url} alt={model.name} className="h-5 w-5 rounded object-cover shrink-0" />
                              : <Package className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                            {isEditing ? (
                              <>
                                <ImageUpload compact value={editModelImage} onChange={setEditModelImage} className="shrink-0" />
                                <input autoFocus value={editModelName}
                                  onChange={e => setEditModelName(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') renameModel(model.id); if (e.key === 'Escape') setEditingModelId(null) }}
                                  onClick={e => e.stopPropagation()}
                                  className="flex-1 h-7 min-w-0 rounded border border-brand-teal px-2 text-sm focus:outline-none" />
                                <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => renameModel(model.id)} className="p-1 rounded text-green-600 hover:bg-green-50"><Check className="h-3.5 w-3.5" /></button>
                                  <button onClick={() => setEditingModelId(null)} className="p-1 rounded text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
                                </div>
                              </>
                            ) : (
                              <>
                                <span className="flex-1 text-sm text-gray-800 truncate">{model.name}</span>
                                <span className="text-[11px] text-gray-400 shrink-0 mr-1">{partCount}p</span>
                                <div className="flex gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => { setEditingModelId(model.id); setEditModelName(model.name); setEditModelImage(model.image_url ?? '') }} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"><Pencil className="h-3 w-3" /></button>
                                  <button onClick={() => deleteModel(model.id)} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="h-3 w-3" /></button>
                                </div>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
              {/* ── Col 4: Part Types ── */}
              <div className={`flex flex-col ${mobileStep !== 3 ? 'hidden lg:flex' : 'flex'}`}>
                <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-purple-500" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Part Types</span>
                  </div>
                  {selectedModelId && <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-1.5">{partTypes.filter(p => p.device_id === selectedModelId).length}</span>}
                </div>
                {!selectedModelId ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6 py-10">
                    <Cpu className="h-9 w-9 text-gray-200" />
                    <p className="text-xs text-gray-400">Select a model first</p>
                  </div>
                ) : (
                  <>
                    <div className="px-3 py-2 border-b border-gray-100">
                      <div className="flex gap-1.5 items-center">
                        <ImageUpload compact value={newPartImage} onChange={setNewPartImage} />
                        <input type="text" placeholder="e.g. Screen, Battery, IC…" value={newPartName}
                          onChange={e => setNewPartName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addPartType(selectedModelId)}
                          className="h-8 flex-1 min-w-0 rounded-md border border-gray-200 px-2.5 text-sm focus:border-purple-400 focus:outline-none" />
                        <button onClick={() => addPartType(selectedModelId)} disabled={catalogueSaving || !newPartName.trim()}
                          className="h-8 px-3 rounded-md bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 disabled:opacity-40 flex items-center gap-1 shrink-0">
                          <Plus className="h-3.5 w-3.5" /> Add
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {partTypes.filter(p => p.device_id === selectedModelId).length === 0 && <p className="text-xs text-gray-400 text-center py-10">No part types yet</p>}
                      {partTypes.filter(p => p.device_id === selectedModelId).map(pt => {
                        const isEditing = editingPartId === pt.id
                        return (
                          <div key={pt.id} className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-50 last:border-b-0 hover:bg-purple-50/40 transition-colors">
                            {pt.image_url
                              ? <img src={pt.image_url} alt={pt.name} className="h-5 w-5 rounded object-cover shrink-0" />
                              : <Cpu className="h-3.5 w-3.5 text-purple-400 shrink-0" />}
                            {isEditing ? (
                              <>
                                <ImageUpload compact value={editPartImage} onChange={setEditPartImage} className="shrink-0" />
                                <input autoFocus value={editPartName}
                                  onChange={e => setEditPartName(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') renamePartType(pt.id); if (e.key === 'Escape') setEditingPartId(null) }}
                                  className="flex-1 h-7 min-w-0 rounded border border-purple-400 px-2 text-sm focus:outline-none" />
                                <div className="flex gap-1 shrink-0">
                                  <button onClick={() => renamePartType(pt.id)} className="p-1 rounded text-green-600 hover:bg-green-50"><Check className="h-3.5 w-3.5" /></button>
                                  <button onClick={() => setEditingPartId(null)} className="p-1 rounded text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
                                </div>
                              </>
                            ) : (
                              <>
                                <span className="flex-1 text-sm text-gray-800 truncate">{pt.name}</span>
                                <div className="flex gap-0.5 shrink-0">
                                  <button onClick={() => { setEditingPartId(pt.id); setEditPartName(pt.name); setEditPartImage(pt.image_url ?? '') }} className="p-1 rounded text-gray-400 hover:text-purple-600 hover:bg-purple-50"><Pencil className="h-3 w-3" /></button>
                                  <button onClick={() => deletePartType(pt.id)} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="h-3 w-3" /></button>
                                </div>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {/* Selected model context */}
                    <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/60">
                      <p className="text-[11px] text-gray-400 truncate">
                        <span className="font-medium text-gray-500">{models.find(m => m.id === selectedModelId)?.name}</span>
                        {' '}· {brands.find(b => b.id === selectedBrandId)?.name}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </Tabs.Content>}
      </Tabs.Root>
    </div>
  )
}
