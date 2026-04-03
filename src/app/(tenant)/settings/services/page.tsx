'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'

// ── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: string; name: string; slug: string; parent_id: string | null
  display_order: number; show_on_pos: boolean
}
interface Manufacturer {
  id: string; name: string; logo_url: string | null
}
interface Device {
  id: string; manufacturer_id: string; name: string
  service_manufacturers?: { name: string } | null
}
interface Problem {
  id: string; name: string; device_id: string | null; category_id: string | null
  price: number; cost: number; warranty_days: number; show_on_pos: boolean
  service_devices?: { name: string; service_manufacturers?: { name: string } | null } | null
  service_categories?: { name: string } | null
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const catSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only'),
  display_order: z.coerce.number().int().default(0),
  show_on_pos: z.boolean().default(true),
})
const mfrSchema = z.object({ name: z.string().min(1) })
const devSchema = z.object({
  manufacturer_id: z.string().uuid('Select a manufacturer'),
  name: z.string().min(1),
})
const probSchema = z.object({
  name: z.string().min(1),
  device_id: z.string().uuid().optional().or(z.literal('')),
  category_id: z.string().uuid().optional().or(z.literal('')),
  price: z.coerce.number().min(0).default(0),
  cost: z.coerce.number().min(0).default(0),
  warranty_days: z.coerce.number().int().min(0).default(0),
  show_on_pos: z.boolean().default(true),
  notes: z.string().optional(),
})

type CatForm  = z.infer<typeof catSchema>
type MfrForm  = z.infer<typeof mfrSchema>
type DevForm  = z.infer<typeof devSchema>
type ProbForm = z.infer<typeof probSchema>

type ActiveTab = 'categories' | 'manufacturers' | 'devices' | 'problems'

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ServicesSettingsPage() {
  const { activeBranch } = useAuthStore()
  const [tab, setTab] = useState<ActiveTab>('manufacturers')

  const [categories,    setCategories]    = useState<Category[]>([])
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([])
  const [devices,       setDevices]       = useState<Device[]>([])
  const [problems,      setProblems]      = useState<Problem[]>([])

  const [loading, setLoading] = useState(false)

  // Modal state
  const [catModal,  setCatModal]  = useState<{ open: boolean; editing: Category | null }>({ open: false, editing: null })
  const [mfrModal,  setMfrModal]  = useState<{ open: boolean; editing: Manufacturer | null }>({ open: false, editing: null })
  const [devModal,  setDevModal]  = useState<{ open: boolean; editing: Device | null }>({ open: false, editing: null })
  const [probModal, setProbModal] = useState<{ open: boolean; editing: Problem | null }>({ open: false, editing: null })

  // Filters
  const [devMfrFilter, setDevMfrFilter] = useState('')
  const [probDevFilter, setProbDevFilter] = useState('')

  // Forms
  const catForm  = useForm<CatForm>({ resolver: zodResolver(catSchema) })
  const mfrForm  = useForm<MfrForm>({ resolver: zodResolver(mfrSchema) })
  const devForm  = useForm<DevForm>({ resolver: zodResolver(devSchema) })
  const probForm = useForm<ProbForm>({ resolver: zodResolver(probSchema) })

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [catRes, mfrRes, devRes, probRes] = await Promise.all([
      fetch('/api/services/categories'),
      fetch('/api/services/manufacturers'),
      fetch('/api/services/devices'),
      fetch('/api/services/problems'),
    ])
    const [catJson, mfrJson, devJson, probJson] = await Promise.all([
      catRes.json(), mfrRes.json(), devRes.json(), probRes.json(),
    ])
    setCategories(catJson.data ?? [])
    setManufacturers(mfrJson.data ?? [])
    setDevices(devJson.data ?? [])
    setProblems(probJson.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { if (activeBranch) fetchAll() }, [activeBranch, fetchAll])

  // ── CRUD helpers ───────────────────────────────────────────────────────────

  async function deleteRow(endpoint: string, id: string) {
    if (!confirm('Delete this item? This cannot be undone.')) return
    await fetch(`${endpoint}/${id}`, { method: 'DELETE' })
    fetchAll()
  }

  // Categories
  async function saveCat(data: CatForm) {
    const { editing } = catModal
    const url    = editing ? `/api/services/categories/${editing.id}` : '/api/services/categories'
    const method = editing ? 'PUT' : 'POST'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    setCatModal({ open: false, editing: null })
    fetchAll()
  }

  // Manufacturers
  async function saveMfr(data: MfrForm) {
    const { editing } = mfrModal
    const url    = editing ? `/api/services/manufacturers/${editing.id}` : '/api/services/manufacturers'
    const method = editing ? 'PUT' : 'POST'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    setMfrModal({ open: false, editing: null })
    fetchAll()
  }

  // Devices
  async function saveDev(data: DevForm) {
    const { editing } = devModal
    const url    = editing ? `/api/services/devices/${editing.id}` : '/api/services/devices'
    const method = editing ? 'PUT' : 'POST'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    setDevModal({ open: false, editing: null })
    fetchAll()
  }

  // Problems
  async function saveProb(data: ProbForm) {
    const { editing } = probModal
    const url    = editing ? `/api/services/problems/${editing.id}` : '/api/services/problems'
    const method = editing ? 'PUT' : 'POST'
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        device_id:   data.device_id   || null,
        category_id: data.category_id || null,
      }),
    })
    setProbModal({ open: false, editing: null })
    fetchAll()
  }

  // ── Open modals ────────────────────────────────────────────────────────────

  function openCatModal(editing: Category | null = null) {
    catForm.reset(editing
      ? { name: editing.name, slug: editing.slug, display_order: editing.display_order, show_on_pos: editing.show_on_pos }
      : { name: '', slug: '', display_order: 0, show_on_pos: true }
    )
    setCatModal({ open: true, editing })
  }

  function openMfrModal(editing: Manufacturer | null = null) {
    mfrForm.reset(editing ? { name: editing.name } : { name: '' })
    setMfrModal({ open: true, editing })
  }

  function openDevModal(editing: Device | null = null) {
    devForm.reset(editing
      ? { manufacturer_id: editing.manufacturer_id, name: editing.name }
      : { manufacturer_id: '', name: '' }
    )
    setDevModal({ open: true, editing })
  }

  function openProbModal(editing: Problem | null = null) {
    probForm.reset(editing
      ? {
          name: editing.name,
          device_id:   editing.device_id   ?? '',
          category_id: editing.category_id ?? '',
          price: editing.price,
          cost:  editing.cost,
          warranty_days: editing.warranty_days,
          show_on_pos: editing.show_on_pos,
          notes: '',
        }
      : { name: '', price: 0, cost: 0, warranty_days: 0, show_on_pos: true }
    )
    setProbModal({ open: true, editing })
  }

  // ── Filtered lists ─────────────────────────────────────────────────────────

  const filteredDevices  = devMfrFilter  ? devices.filter((d) => d.manufacturer_id === devMfrFilter)   : devices
  const filteredProblems = probDevFilter ? problems.filter((p) => p.device_id === probDevFilter) : problems

  // ── Tab buttons ────────────────────────────────────────────────────────────

  const tabs: { key: ActiveTab; label: string; count: number }[] = [
    { key: 'manufacturers', label: 'Manufacturers', count: manufacturers.length },
    { key: 'devices',       label: 'Devices',       count: devices.length },
    { key: 'categories',    label: 'Categories',    count: categories.length },
    { key: 'problems',      label: 'Problems / Services', count: problems.length },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Service Catalogue</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Define your repair categories, device models, and service problems.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Manufacturers ────────────────────────────────────────────────────── */}
      {tab === 'manufacturers' && (
        <section className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => openMfrModal()}>
              <Plus className="h-4 w-4" /> Add Manufacturer
            </Button>
          </div>
          <div className="divide-y rounded-xl border border-gray-200 bg-white">
            {manufacturers.length === 0 && (
              <p className="py-10 text-center text-sm text-gray-400">No manufacturers yet.</p>
            )}
            {manufacturers.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3">
                <span className="font-medium text-gray-800">{m.name}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openMfrModal(m)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteRow('/api/services/manufacturers', m.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Devices ──────────────────────────────────────────────────────────── */}
      {tab === 'devices' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <select
              value={devMfrFilter}
              onChange={(e) => setDevMfrFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="">All manufacturers</option>
              {manufacturers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <Button size="sm" onClick={() => openDevModal()}>
              <Plus className="h-4 w-4" /> Add Device
            </Button>
          </div>
          <div className="divide-y rounded-xl border border-gray-200 bg-white">
            {filteredDevices.length === 0 && (
              <p className="py-10 text-center text-sm text-gray-400">No devices yet.</p>
            )}
            {filteredDevices.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-gray-800">{d.name}</p>
                  <p className="text-xs text-gray-400">{d.service_manufacturers?.name}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openDevModal(d)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteRow('/api/services/devices', d.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Categories ───────────────────────────────────────────────────────── */}
      {tab === 'categories' && (
        <section className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => openCatModal()}>
              <Plus className="h-4 w-4" /> Add Category
            </Button>
          </div>
          <div className="divide-y rounded-xl border border-gray-200 bg-white">
            {categories.length === 0 && (
              <p className="py-10 text-center text-sm text-gray-400">No categories yet.</p>
            )}
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800">{c.name}</span>
                  <span className="text-xs text-gray-400 font-mono">{c.slug}</span>
                  {!c.show_on_pos && <Badge variant="default">Hidden on POS</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openCatModal(c)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteRow('/api/services/categories', c.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Problems / Services ──────────────────────────────────────────────── */}
      {tab === 'problems' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <select
              value={probDevFilter}
              onChange={(e) => setProbDevFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="">All devices</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.service_manufacturers?.name} {d.name}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={() => openProbModal()}>
              <Plus className="h-4 w-4" /> Add Service
            </Button>
          </div>
          <div className="divide-y rounded-xl border border-gray-200 bg-white">
            {filteredProblems.length === 0 && (
              <p className="py-10 text-center text-sm text-gray-400">No services yet.</p>
            )}
            {filteredProblems.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-gray-800">{p.name}</p>
                  <p className="text-xs text-gray-400">
                    {p.service_devices?.service_manufacturers?.name} {p.service_devices?.name}
                    {p.service_categories?.name && ` · ${p.service_categories.name}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{formatCurrency(p.price)}</p>
                    {p.warranty_days > 0 && (
                      <p className="text-xs text-gray-400">{p.warranty_days}d warranty</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openProbModal(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteRow('/api/services/problems', p.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────────── */}

      {/* Category modal */}
      <Modal
        open={catModal.open}
        onClose={() => setCatModal({ open: false, editing: null })}
        title={catModal.editing ? 'Edit Category' : 'New Category'}
        size="sm"
      >
        <form onSubmit={catForm.handleSubmit(saveCat)} className="space-y-3">
          <Input label="Name" {...catForm.register('name')} error={catForm.formState.errors.name?.message} />
          <Input label="Slug (URL-safe)" {...catForm.register('slug')} error={catForm.formState.errors.slug?.message} />
          <Input label="Display Order" type="number" {...catForm.register('display_order')} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...catForm.register('show_on_pos')} className="rounded" />
            Show on POS
          </label>
          <Button type="submit" className="w-full" loading={catForm.formState.isSubmitting}>Save</Button>
        </form>
      </Modal>

      {/* Manufacturer modal */}
      <Modal
        open={mfrModal.open}
        onClose={() => setMfrModal({ open: false, editing: null })}
        title={mfrModal.editing ? 'Edit Manufacturer' : 'New Manufacturer'}
        size="sm"
      >
        <form onSubmit={mfrForm.handleSubmit(saveMfr)} className="space-y-3">
          <Input label="Name" {...mfrForm.register('name')} error={mfrForm.formState.errors.name?.message} />
          <Button type="submit" className="w-full" loading={mfrForm.formState.isSubmitting}>Save</Button>
        </form>
      </Modal>

      {/* Device modal */}
      <Modal
        open={devModal.open}
        onClose={() => setDevModal({ open: false, editing: null })}
        title={devModal.editing ? 'Edit Device' : 'New Device'}
        size="sm"
      >
        <form onSubmit={devForm.handleSubmit(saveDev)} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Manufacturer</label>
            <select
              {...devForm.register('manufacturer_id')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Select manufacturer…</option>
              {manufacturers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            {devForm.formState.errors.manufacturer_id && (
              <p className="mt-1 text-xs text-red-500">{devForm.formState.errors.manufacturer_id.message}</p>
            )}
          </div>
          <Input label="Device Name" {...devForm.register('name')} error={devForm.formState.errors.name?.message} />
          <Button type="submit" className="w-full" loading={devForm.formState.isSubmitting}>Save</Button>
        </form>
      </Modal>

      {/* Problem modal */}
      <Modal
        open={probModal.open}
        onClose={() => setProbModal({ open: false, editing: null })}
        title={probModal.editing ? 'Edit Service' : 'New Service'}
        size="sm"
      >
        <form onSubmit={probForm.handleSubmit(saveProb)} className="space-y-3">
          <Input label="Service Name" {...probForm.register('name')} error={probForm.formState.errors.name?.message} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Device (optional)</label>
              <select
                {...probForm.register('device_id')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Any / all devices</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.service_manufacturers?.name} {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Category (optional)</label>
              <select
                {...probForm.register('category_id')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Price (£)" type="number" step="0.01" min="0" {...probForm.register('price')} />
            <Input label="Cost (£)"  type="number" step="0.01" min="0" {...probForm.register('cost')} />
            <Input label="Warranty (days)" type="number" min="0" {...probForm.register('warranty_days')} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...probForm.register('show_on_pos')} className="rounded" />
            Show on POS
          </label>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" {...probForm.register('notes')} />
          </div>
          <Button type="submit" className="w-full" loading={probForm.formState.isSubmitting}>Save Service</Button>
        </form>
      </Modal>
    </div>
  )
}
