'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Pencil, Trash2, Check, X, ChevronRight,
  Wrench, Cpu, Tag, Layers, Info,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Brand       { id: string; name: string }
interface Device      { id: string; name: string; manufacturer_id: string }
interface DeviceType  { id: string; name: string; slug: string; show_on_pos: boolean }
interface Service     {
  id: string; name: string; price: number; cost: number
  warranty_days: number; show_on_pos: boolean
  device_id: string | null; category_id: string | null
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const serviceSchema = z.object({
  name:          z.string().min(1, 'Name is required'),
  price:         z.coerce.number().min(0).default(0),
  cost:          z.coerce.number().min(0).default(0),
  warranty_days: z.coerce.number().int().min(0).default(0),
  category_id:   z.string().optional(),
  show_on_pos:   z.boolean().default(true),
})
type ServiceForm = z.infer<typeof serviceSchema>

const typeSchema = z.object({
  name:        z.string().min(1, 'Name is required'),
  slug:        z.string().min(1).regex(/^[a-z0-9-]+$/, 'Lowercase, numbers, hyphens only'),
  show_on_pos: z.boolean().default(true),
})
type TypeForm = z.infer<typeof typeSchema>

// ── Reusable column header ──────────────────────────────────────────────────

function ColHeader({
  icon: Icon, iconColor, label, count,
}: {
  icon: React.ElementType; iconColor: string; label: string; count: number | null
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200 shrink-0">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>
      </div>
      {count !== null && (
        <span className="text-[11px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-px font-medium">
          {count}
        </span>
      )}
    </div>
  )
}

// ── Inline text input row ──────────────────────────────────────────────────

function AddRow({
  placeholder, value, onChange, onAdd, onKeyDown, disabled, accentClass, extra,
}: {
  placeholder: string; value: string; onChange: (v: string) => void
  onAdd: () => void; onKeyDown?: (e: React.KeyboardEvent) => void
  disabled?: boolean; accentClass?: string; extra?: React.ReactNode
}) {
  return (
    <div className="px-3 py-2 border-b border-gray-100 space-y-1.5 shrink-0">
      <div className="flex gap-1.5">
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown ?? ((e) => e.key === 'Enter' && onAdd())}
          className={`h-10 flex-1 min-w-0 rounded-md border border-gray-200 px-3 text-[15px] focus:outline-none focus:border-brand-teal`}
        />
        {extra}
        <button
          onClick={onAdd}
          disabled={disabled || !value.trim()}
          className={`h-10 px-4 rounded-md text-white text-[13px] font-medium disabled:opacity-40 flex items-center gap-1.5 shrink-0 transition-opacity ${accentClass ?? 'bg-brand-teal hover:bg-brand-teal/90'}`}
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
    </div>
  )
}

// ── Empty prompt ──────────────────────────────────────────────────────────

function EmptyPrompt({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 py-12">
      <Icon className="h-9 w-9 text-gray-200" />
      <p className="text-xs text-gray-400 text-center">{text}</p>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ServiceCataloguePage() {
  const [brands,      setBrands]      = useState<Brand[]>([])
  const [devices,     setDevices]     = useState<Device[]>([])
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([])
  const [services,    setServices]    = useState<Service[]>([])
  const [saving, setSaving] = useState(false)

  // selection
  const [selectedTypeId,  setSelectedTypeId]  = useState<string | null>(null)
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null)
  const [selectedDevId,   setSelectedDevId]   = useState<string | null>(null)
  const [mobileStep, setMobileStep]           = useState<0 | 1 | 2 | 3>(0)

  // inline add
  const [newTypeName,  setNewTypeName]  = useState('')
  const [newTypeSlug,  setNewTypeSlug]  = useState('')
  const [newBrandName, setNewBrandName] = useState('')
  const [newDevName,   setNewDevName]   = useState('')
  const [newSvcName,   setNewSvcName]   = useState('')
  const [newSvcPrice,  setNewSvcPrice]  = useState('')

  // inline rename
  const [editingTypeId,  setEditingTypeId]  = useState<string | null>(null)
  const [editTypeName,   setEditTypeName]   = useState('')
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null)
  const [editBrandName,  setEditBrandName]  = useState('')
  const [editingDevId,   setEditingDevId]   = useState<string | null>(null)
  const [editDevName,    setEditDevName]    = useState('')

  // modals
  const [svcModal,  setSvcModal]  = useState<{ open: boolean; editing: Service | null; deviceId: string | null }>({ open: false, editing: null, deviceId: null })
  const [typeModal, setTypeModal] = useState<{ open: boolean; editing: DeviceType | null }>({ open: false, editing: null })

  const svcForm  = useForm<ServiceForm>({ resolver: zodResolver(serviceSchema) })
  const typeForm = useForm<TypeForm>({ resolver: zodResolver(typeSchema) })

  // ── Data loading ────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const [bRes, dRes, tRes, sRes] = await Promise.all([
      fetch('/api/services/manufacturers'),
      fetch('/api/services/devices'),
      fetch('/api/services/categories'),
      fetch('/api/services/problems'),
    ])
    const [bj, dj, tj, sj] = await Promise.all([bRes.json(), dRes.json(), tRes.json(), sRes.json()])
    setBrands(bj.data ?? [])
    setDevices(dj.data ?? [])
    setDeviceTypes(tj.data ?? [])
    setServices(sj.data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  // ── Device Types (was Categories) ───────────────────────────────────────

  async function addTypeInline() {
    if (!newTypeName.trim()) return
    setSaving(true)
    const slug = newTypeSlug.trim() || newTypeName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
    await fetch('/api/services/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTypeName.trim(), slug, show_on_pos: true }),
    })
    setNewTypeName(''); setNewTypeSlug(''); await load(); setSaving(false)
  }

  async function renameType(id: string) {
    if (!editTypeName.trim()) return
    const t = deviceTypes.find(c => c.id === id)
    await fetch(`/api/services/categories/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editTypeName.trim(), slug: t?.slug ?? editTypeName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'), show_on_pos: t?.show_on_pos ?? true }),
    })
    setEditingTypeId(null); await load()
  }

  async function deleteType(id: string) {
    if (!confirm('Delete this device type?')) return
    await fetch(`/api/services/categories/${id}`, { method: 'DELETE' }); await load()
  }

  function openTypeModal(editing: DeviceType | null = null) {
    typeForm.reset(editing
      ? { name: editing.name, slug: editing.slug, show_on_pos: editing.show_on_pos }
      : { name: '', slug: '', show_on_pos: true }
    )
    setTypeModal({ open: true, editing })
  }

  async function saveTypeModal(data: TypeForm) {
    const { editing } = typeModal
    const url    = editing ? `/api/services/categories/${editing.id}` : '/api/services/categories'
    const method = editing ? 'PUT' : 'POST'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    setTypeModal({ open: false, editing: null }); await load()
  }

  // ── Brands (was Manufacturers) ──────────────────────────────────────────

  async function addBrand() {
    if (!newBrandName.trim()) return
    setSaving(true)
    await fetch('/api/services/manufacturers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newBrandName.trim() }),
    })
    setNewBrandName(''); await load(); setSaving(false)
  }

  async function renameBrand(id: string) {
    if (!editBrandName.trim()) return
    await fetch(`/api/services/manufacturers/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editBrandName.trim() }),
    })
    setEditingBrandId(null); await load()
  }

  async function deleteBrand(id: string) {
    if (!confirm('Delete this brand? All its devices will also be removed.')) return
    await fetch(`/api/services/manufacturers/${id}`, { method: 'DELETE' }); await load()
  }

  // ── Devices ─────────────────────────────────────────────────────────────

  async function addDevice() {
    if (!newDevName.trim() || !selectedBrandId) return
    setSaving(true)
    await fetch('/api/services/devices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newDevName.trim(), manufacturer_id: selectedBrandId }),
    })
    setNewDevName(''); await load(); setSaving(false)
  }

  async function renameDevice(id: string) {
    if (!editDevName.trim()) return
    await fetch(`/api/services/devices/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editDevName.trim() }),
    })
    setEditingDevId(null); await load()
  }

  async function deleteDevice(id: string) {
    if (!confirm('Delete this device? Its services will be unlinked.')) return
    await fetch(`/api/services/devices/${id}`, { method: 'DELETE' }); await load()
  }

  // ── Services ─────────────────────────────────────────────────────────────

  async function addServiceInline() {
    if (!newSvcName.trim() || !selectedDevId) return
    setSaving(true)
    const price = parseFloat(newSvcPrice) || 0
    await fetch('/api/services/problems', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSvcName.trim(), price, cost: 0, warranty_days: 0, show_on_pos: true, device_id: selectedDevId }),
    })
    setNewSvcName(''); setNewSvcPrice(''); await load(); setSaving(false)
  }

  async function saveServiceModal(data: ServiceForm) {
    const { editing, deviceId } = svcModal
    const url    = editing ? `/api/services/problems/${editing.id}` : '/api/services/problems'
    const method = editing ? 'PUT' : 'POST'
    await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, device_id: deviceId, category_id: data.category_id || null }),
    })
    setSvcModal({ open: false, editing: null, deviceId: null }); await load()
  }

  async function deleteService(id: string) {
    if (!confirm('Delete this service?')) return
    await fetch(`/api/services/problems/${id}`, { method: 'DELETE' }); await load()
  }

  function openSvcModal(editing: Service | null = null) {
    svcForm.reset(editing
      ? { name: editing.name, price: editing.price, cost: editing.cost, warranty_days: editing.warranty_days, category_id: editing.category_id ?? '', show_on_pos: editing.show_on_pos }
      : { name: newSvcName, price: parseFloat(newSvcPrice) || 0, cost: 0, warranty_days: 0, show_on_pos: true, category_id: '' }
    )
    setSvcModal({ open: true, editing, deviceId: editing?.device_id ?? selectedDevId })
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  // Device types show all brands (no FK link in DB yet) — type selection is a visual gateway
  const filteredDevices  = selectedBrandId ? devices.filter(d => d.manufacturer_id === selectedBrandId) : []
  const filteredServices = selectedDevId   ? services.filter(s => s.device_id === selectedDevId)        : []

  const selectedType  = deviceTypes.find(t => t.id === selectedTypeId)
  const selectedBrand = brands.find(b => b.id === selectedBrandId)
  const selectedDevice = devices.find(d => d.id === selectedDevId)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-on-surface">Service Catalogue</h1>
        <p className="text-sm text-on-surface-variant mt-0.5">
          Define device types, brands, devices and repair services.
        </p>
      </div>

      {/* Breadcrumb — hierarchy guide */}
      <div className="hidden lg:flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 rounded-lg px-4 py-2.5 border border-gray-200">
        <Info className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        <span className="font-medium text-gray-600">Hierarchy:</span>
        <span className="flex items-center gap-1">
          <Tag className="h-3 w-3 text-purple-500" /> Device Type
        </span>
        <ChevronRight className="h-3 w-3 text-gray-300" />
        <span className="flex items-center gap-1">
          <Layers className="h-3 w-3 text-brand-teal" /> Brand
        </span>
        <ChevronRight className="h-3 w-3 text-gray-300" />
        <span className="flex items-center gap-1">
          <Cpu className="h-3 w-3 text-blue-500" /> Device
        </span>
        <ChevronRight className="h-3 w-3 text-gray-300" />
        <span className="flex items-center gap-1">
          <Wrench className="h-3 w-3 text-orange-400" /> Service
        </span>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">

        {/* Mobile breadcrumb */}
        <div className="lg:hidden border-b border-gray-100 px-4 py-2 bg-gray-50 flex items-center gap-1 flex-wrap text-xs">
          <button
            onClick={() => setMobileStep(0)}
            className={`px-2.5 py-1 rounded-full font-medium transition-colors ${mobileStep === 0 ? 'bg-purple-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Device Types
          </button>
          {selectedTypeId && (<>
            <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" />
            <button
              onClick={() => setMobileStep(1)}
              className={`px-2.5 py-1 rounded-full font-medium transition-colors ${mobileStep === 1 ? 'bg-brand-teal text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {selectedType?.name ?? 'Brands'}
            </button>
          </>)}
          {selectedBrandId && (<>
            <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" />
            <button
              onClick={() => setMobileStep(2)}
              className={`px-2.5 py-1 rounded-full font-medium transition-colors ${mobileStep === 2 ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {selectedBrand?.name ?? 'Devices'}
            </button>
          </>)}
          {selectedDevId && (<>
            <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" />
            <button
              onClick={() => setMobileStep(3)}
              className={`px-2.5 py-1 rounded-full font-medium transition-colors ${mobileStep === 3 ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {selectedDevice?.name ?? 'Services'}
            </button>
          </>)}
        </div>

        {/* 4-column explorer */}
        <div className="lg:grid lg:grid-cols-4 lg:divide-x lg:divide-gray-200" style={{ minHeight: 540 }}>

          {/* ── Col 1: Device Types ── */}
          <div className={`flex flex-col border-b lg:border-b-0 border-gray-200 ${mobileStep !== 0 ? 'hidden lg:flex' : 'flex'}`}>
            <ColHeader icon={Tag} iconColor="text-purple-500" label="Device Types" count={deviceTypes.length} />

            {/* Quick add */}
            <div className="px-3 py-2 border-b border-gray-100 shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Phone, Laptop…"
                  value={newTypeName}
                  onChange={(e) => {
                    setNewTypeName(e.target.value)
                    setNewTypeSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && addTypeInline()}
                  className="h-10 flex-1 min-w-0 rounded-md border border-gray-200 px-3 text-[15px] focus:outline-none focus:border-purple-400"
                />
                <button
                  onClick={addTypeInline}
                  disabled={saving || !newTypeName.trim()}
                  className="h-10 px-4 rounded-md bg-purple-600 text-white text-[13px] font-medium hover:bg-purple-700 disabled:opacity-40 flex items-center gap-1.5 shrink-0"
                >
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>
              <button
                onClick={() => openTypeModal()}
                className="mt-2 h-8 w-full rounded-md border border-gray-200 text-gray-500 text-xs font-medium hover:bg-gray-50 flex items-center justify-center gap-1"
              >
                <Pencil className="h-3.5 w-3.5" /> Full details (slug, POS visibility)
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {deviceTypes.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-10">No device types yet</p>
              )}
              {deviceTypes.map(dt => {
                const isSelected = selectedTypeId === dt.id
                const isEditing  = editingTypeId === dt.id
                const brandCount = brands.length // no FK link — show total
                return (
                  <div
                    key={dt.id}
                    onClick={() => {
                      if (!isEditing) {
                        setSelectedTypeId(dt.id)
                        setSelectedBrandId(null)
                        setSelectedDevId(null)
                        setMobileStep(1)
                      }
                    }}
                    className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer border-b border-gray-50 last:border-b-0 transition-colors
                      ${isSelected ? 'bg-purple-50 border-l-[3px] border-l-purple-500' : 'hover:bg-gray-50 border-l-[3px] border-l-transparent'}`}
                  >
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border ${isSelected ? 'bg-purple-100 border-purple-200' : 'bg-gray-50 border-gray-200'}`}>
                      <Tag className={`h-4 w-4 shrink-0 ${isSelected ? 'text-purple-600' : 'text-gray-400'}`} />
                    </div>
                    {isEditing ? (
                      <>
                        <input
                          autoFocus value={editTypeName}
                          onChange={(e) => setEditTypeName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') renameType(dt.id); if (e.key === 'Escape') setEditingTypeId(null) }}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 h-7 min-w-0 rounded border border-purple-400 px-2 text-sm focus:outline-none"
                        />
                        <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => renameType(dt.id)} className="p-1 rounded text-green-600 hover:bg-green-50"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setEditingTypeId(null)} className="p-1 rounded text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[15px] truncate font-medium ${isSelected ? 'text-purple-700' : 'text-gray-800'}`}>{dt.name}</p>
                          {!dt.show_on_pos && <p className="text-[11px] font-medium text-gray-400 mt-0.5">Hidden on POS</p>}
                        </div>
                        <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => { setEditingTypeId(dt.id); setEditTypeName(dt.name) }}
                            className="p-1.5 rounded text-gray-400 hover:text-purple-600 hover:bg-purple-50"
                          ><Pencil className="h-3.5 w-3.5" /></button>
                          <button
                            onClick={() => deleteType(dt.id)}
                            className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                          ><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Col 2: Brands (was Manufacturers) ── */}
          <div className={`flex flex-col border-b lg:border-b-0 border-gray-200 ${mobileStep !== 1 ? 'hidden lg:flex' : 'flex'}`}>
            <ColHeader icon={Layers} iconColor="text-brand-teal" label="Brands" count={selectedTypeId ? brands.length : null} />

            {!selectedTypeId ? (
              <EmptyPrompt icon={Layers} text="Select a device type first" />
            ) : (
              <>
                <AddRow
                  placeholder="e.g. Apple, Samsung…"
                  value={newBrandName}
                  onChange={setNewBrandName}
                  onAdd={addBrand}
                  disabled={saving}
                />
                <div className="flex-1 overflow-y-auto">
                  {brands.length === 0 && <p className="text-xs text-gray-400 text-center py-10">No brands yet</p>}
                  {brands.map(brand => {
                    const isSelected = selectedBrandId === brand.id
                    const isEditing  = editingBrandId === brand.id
                    const devCount   = devices.filter(d => d.manufacturer_id === brand.id).length
                    return (
                      <div
                        key={brand.id}
                        onClick={() => { if (!isEditing) { setSelectedBrandId(brand.id); setSelectedDevId(null); setMobileStep(2) } }}
                        className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer border-b border-gray-50 last:border-b-0 transition-colors
                          ${isSelected ? 'bg-teal-50 border-l-[3px] border-l-brand-teal' : 'hover:bg-gray-50 border-l-[3px] border-l-transparent'}`}
                      >
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border ${isSelected ? 'bg-teal-100 border-teal-200' : 'bg-gray-50 border-gray-200'}`}>
                          <Layers className={`h-4 w-4 shrink-0 ${isSelected ? 'text-brand-teal' : 'text-gray-400'}`} />
                        </div>
                        {isEditing ? (
                          <>
                            <input
                              autoFocus value={editBrandName}
                              onChange={(e) => setEditBrandName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') renameBrand(brand.id); if (e.key === 'Escape') setEditingBrandId(null) }}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 h-7 min-w-0 rounded border border-brand-teal px-2 text-sm focus:outline-none"
                            />
                            <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => renameBrand(brand.id)} className="p-1 rounded text-green-600 hover:bg-green-50"><Check className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setEditingBrandId(null)} className="p-1 rounded text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className={`flex-1 text-[15px] truncate font-medium ${isSelected ? 'text-teal-700' : 'text-gray-800'}`}>{brand.name}</span>
                            <span className="text-xs font-semibold text-gray-400 shrink-0 mr-2">{devCount}</span>
                            <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => { setEditingBrandId(brand.id); setEditBrandName(brand.name) }} className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => deleteBrand(brand.id)} className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
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

          {/* ── Col 3: Devices ── */}
          <div className={`flex flex-col border-b lg:border-b-0 border-gray-200 ${mobileStep !== 2 ? 'hidden lg:flex' : 'flex'}`}>
            <ColHeader icon={Cpu} iconColor="text-blue-500" label="Devices" count={selectedBrandId ? filteredDevices.length : null} />

            {!selectedBrandId ? (
              <EmptyPrompt icon={Cpu} text="Select a brand first" />
            ) : (
              <>
                <AddRow
                  placeholder="e.g. iPhone 15, Galaxy S24…"
                  value={newDevName}
                  onChange={setNewDevName}
                  onAdd={addDevice}
                  disabled={saving}
                />
                <div className="flex-1 overflow-y-auto">
                  {filteredDevices.length === 0 && <p className="text-xs text-gray-400 text-center py-10">No devices yet</p>}
                  {filteredDevices.map(dev => {
                    const isSelected = selectedDevId === dev.id
                    const isEditing  = editingDevId === dev.id
                    const svcCount   = services.filter(s => s.device_id === dev.id).length
                    return (
                      <div
                        key={dev.id}
                        onClick={() => { if (!isEditing) { setSelectedDevId(dev.id); setMobileStep(3) } }}
                        className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer border-b border-gray-50 last:border-b-0 transition-colors
                          ${isSelected ? 'bg-blue-50 border-l-[3px] border-l-blue-500' : 'hover:bg-gray-50 border-l-[3px] border-l-transparent'}`}
                      >
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border ${isSelected ? 'bg-blue-100 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                          <Cpu className={`h-4 w-4 shrink-0 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
                        </div>
                        {isEditing ? (
                          <>
                            <input
                              autoFocus value={editDevName}
                              onChange={(e) => setEditDevName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') renameDevice(dev.id); if (e.key === 'Escape') setEditingDevId(null) }}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 h-7 min-w-0 rounded border border-blue-400 px-2 text-sm focus:outline-none"
                            />
                            <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => renameDevice(dev.id)} className="p-1 rounded text-green-600 hover:bg-green-50"><Check className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setEditingDevId(null)} className="p-1 rounded text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className={`flex-1 text-[15px] truncate font-medium ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>{dev.name}</span>
                            <span className="text-xs font-semibold text-gray-400 shrink-0 mr-2">{svcCount} svc</span>
                            <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => { setEditingDevId(dev.id); setEditDevName(dev.name) }} className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => deleteDevice(dev.id)} className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
                {/* Context footer */}
                <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/60 shrink-0">
                  <p className="text-[11px] text-gray-400 truncate">
                    <span className="font-medium text-gray-500">{selectedBrand?.name}</span>
                    {selectedType && <> · {selectedType.name}</>}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* ── Col 4: Services ── */}
          <div className={`flex flex-col ${mobileStep !== 3 ? 'hidden lg:flex' : 'flex'}`}>
            <ColHeader
              icon={Wrench}
              iconColor="text-orange-400"
              label="Services"
              count={selectedDevId ? filteredServices.length : null}
            />

            {!selectedDevId ? (
              <EmptyPrompt icon={Wrench} text="Select a device first" />
            ) : (
              <>
                <div className="px-3 py-2 border-b border-gray-100 space-y-1.5 shrink-0">
                  <div className="flex gap-1.5">
                    <input
                      type="text" placeholder="Service name…" value={newSvcName}
                      onChange={(e) => setNewSvcName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addServiceInline()}
                      className="h-10 flex-1 min-w-0 rounded-md border border-gray-200 px-3 text-[15px] focus:border-orange-400 focus:outline-none"
                    />
                    <input
                      type="number" placeholder="£ Price" value={newSvcPrice}
                      onChange={(e) => setNewSvcPrice(e.target.value)}
                      className="h-10 w-24 rounded-md border border-gray-200 px-3 text-[15px] focus:border-orange-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={addServiceInline} disabled={saving || !newSvcName.trim()}
                      className="h-10 px-4 rounded-md bg-orange-500 text-white text-[13px] font-medium hover:bg-orange-600 disabled:opacity-40 flex items-center gap-1.5"
                    >
                      <Plus className="h-4 w-4" /> Add
                    </button>
                    <button
                      onClick={() => openSvcModal()}
                      className="h-10 px-4 rounded-md border border-gray-200 text-gray-600 text-[13px] font-medium hover:bg-gray-50 flex items-center gap-1.5"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Full details
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredServices.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-10">No services yet</p>
                  )}
                  {filteredServices.map(svc => (
                    <div key={svc.id} className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 last:border-b-0 hover:bg-orange-50/30 transition-colors group">
                      <div className="h-8 w-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0 border border-orange-100">
                        <Wrench className="h-4 w-4 text-orange-500 shrink-0" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] truncate font-medium text-gray-800">{svc.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {svc.warranty_days > 0 && (
                            <p className="text-[11px] font-medium text-gray-400">{svc.warranty_days}d warranty</p>
                          )}
                          {svc.category_id && (
                            <p className="text-[11px] font-medium text-purple-500">
                              {deviceTypes.find(t => t.id === svc.category_id)?.name}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-[15px] font-semibold text-gray-700 shrink-0">{formatCurrency(svc.price)}</span>
                      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                        <button onClick={() => openSvcModal(svc)} className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => deleteService(svc.id)} className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Breadcrumb context */}
                <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/60 shrink-0">
                  <p className="text-[11px] text-gray-400 truncate flex items-center gap-1">
                    {selectedType && <><span className="text-purple-500 font-medium">{selectedType.name}</span><ChevronRight className="h-3 w-3" /></>}
                    {selectedBrand && <><span className="text-teal-600 font-medium">{selectedBrand.name}</span><ChevronRight className="h-3 w-3" /></>}
                    {selectedDevice && <span className="text-blue-600 font-medium">{selectedDevice.name}</span>}
                  </p>
                </div>
              </>
            )}
          </div>

        </div>
      </div>

      {/* ── Service detail modal ── */}
      <Modal
        open={svcModal.open}
        onClose={() => setSvcModal({ open: false, editing: null, deviceId: null })}
        title={svcModal.editing ? 'Edit Service' : 'New Service'}
        size="sm"
      >
        <form onSubmit={svcForm.handleSubmit(saveServiceModal)} className="space-y-3">
          <Input label="Service name" {...svcForm.register('name')} error={svcForm.formState.errors.name?.message} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Price (£)" type="number" step="0.01" min="0" {...svcForm.register('price')} />
            <Input label="Cost (£)"  type="number" step="0.01" min="0" {...svcForm.register('cost')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Warranty (days)" type="number" min="0" {...svcForm.register('warranty_days')} />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Device Type</label>
              <select
                {...svcForm.register('category_id')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-400 focus:outline-none"
              >
                <option value="">None</option>
                {deviceTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...svcForm.register('show_on_pos')} className="rounded" />
            Show on POS
          </label>
          <Button type="submit" className="w-full" loading={svcForm.formState.isSubmitting}>Save Service</Button>
        </form>
      </Modal>

      {/* ── Device Type detail modal ── */}
      <Modal
        open={typeModal.open}
        onClose={() => setTypeModal({ open: false, editing: null })}
        title={typeModal.editing ? 'Edit Device Type' : 'New Device Type'}
        size="sm"
      >
        <form onSubmit={typeForm.handleSubmit(saveTypeModal)} className="space-y-3">
          <Input
            label="Name"
            {...typeForm.register('name')}
            error={typeForm.formState.errors.name?.message}
            onChange={(e) => {
              typeForm.setValue('name', e.target.value)
              if (!typeModal.editing) {
                typeForm.setValue('slug', e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
              }
            }}
          />
          <Input
            label="Slug"
            {...typeForm.register('slug')}
            error={typeForm.formState.errors.slug?.message}
            placeholder="e.g. phone, laptop"
            hint="Used in URLs and POS filters. Lowercase, hyphens only."
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...typeForm.register('show_on_pos')} className="rounded" />
            Show on POS
          </label>
          <Button type="submit" className="w-full" loading={typeForm.formState.isSubmitting}>
            Save Device Type
          </Button>
        </form>
      </Modal>
    </div>
  )
}
