'use client'
import { useState, useEffect } from 'react'
import {
  Search, Plus, ArrowRight, MoreHorizontal, Wrench, ShoppingBag,
  Tag, ClipboardList, Camera, Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth.store'
import { usePosStore } from '@/store/pos.store'
import { formatCurrency } from '@/lib/utils'
import { PatternLock } from '@/components/ui/pattern-lock'
import { CustomFieldRenderer, useCustomFieldDefs } from '@/components/shared/custom-field-renderer'
import { useRouter } from 'next/navigation'
import type { Product } from '@/types/database'
import {
  WARRANTY_OPTIONS, REPAIR_STATUS_OPTIONS, TASK_TYPE_OPTIONS,
  type ServiceCategory, type ServiceBrand, type ServiceDevice,
  type ServiceProblem, type Employee, type RepairDetailsForm,
  type RepairLevel,
} from '../_types'

// ── ChevronRight inline (avoid re-import collision) ───────────────────────────
import { ChevronRight } from 'lucide-react'

const LEVEL_LABELS: Partial<Record<RepairLevel, string>> = {
  categories: 'Category', brands: 'Brand', devices: 'Devices',
  problems: 'Problems', details: 'Details',
}

export function RepairsTab() {
  const router = useRouter()
  const { activeBranch } = useAuthStore()
  const pos = usePosStore()

  // ── Wizard navigation ──────────────────────────────────────────────────────
  const [repairLevel, setRepairLevel]       = useState<RepairLevel>('categories')
  const [repairCategory, setRepairCategory] = useState<ServiceCategory | null>(null)
  const [repairBrand, setRepairBrand]       = useState<ServiceBrand | null>(null)
  const [repairDevice, setRepairDevice]     = useState<ServiceDevice | null>(null)
  const [repairSearch, setRepairSearch]     = useState('')
  const [repairItems, setRepairItems]       = useState<any[]>([])
  const [repairLoading, setRepairLoading]   = useState(false)

  // ── Problems & details ─────────────────────────────────────────────────────
  const [selectedProblems, setSelectedProblems] = useState<ServiceProblem[]>([])
  const [employees, setEmployees]               = useState<Employee[]>([])
  const [repairDetails, setRepairDetails]       = useState<RepairDetailsForm>({
    imei_type: 'Serial', serial_number: '', lock_type: 'passcode', passcode: '',
    repair_charges: 0, charge_deposit: false, deposit_amount: 0,
    is_rush: false, assigned_to: '', due_date: '', status: 'waiting_for_inspection',
    physical_location: '', task_type: 'In-Store', problem_warranties: {},
  })
  const [confirmingRepair, setConfirmingRepair]       = useState(false)
  const [repairDetailsMenuOpen, setRepairDetailsMenuOpen] = useState(false)
  const [repairCustomFields, setRepairCustomFields]   = useState<Record<string, unknown>>({})
  const { defs: repairCustomFieldDefs } = useCustomFieldDefs('repairs', repairCategory?.name ?? undefined)

  // ── Data loading ───────────────────────────────────────────────────────────
  async function loadLevel(level: RepairLevel, parentId?: string) {
    setRepairLoading(true); setRepairSearch('')
    let url = ''
    switch (level) {
      case 'categories': url = '/api/services/categories'; break
      case 'brands':     url = '/api/services/manufacturers'; break
      case 'devices':    url = `/api/services/devices?manufacturer_id=${parentId}`; break
      case 'problems':   url = `/api/services/problems?device_id=${parentId}`; break
      default: setRepairLoading(false); return
    }
    const res = await fetch(url)
    const j = await res.json()
    setRepairItems(j.data ?? [])
    setRepairLoading(false)
  }

  useEffect(() => { loadLevel('categories') }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation helpers ─────────────────────────────────────────────────────
  function resetRepairs() {
    setRepairLevel('categories')
    setRepairCategory(null); setRepairBrand(null); setRepairDevice(null)
    setSelectedProblems([])
    setRepairDetails(d => ({ ...d, serial_number: '', passcode: '', repair_charges: 0, problem_warranties: {} }))
    loadLevel('categories')
  }

  function selectCategory(cat: ServiceCategory) {
    setRepairCategory(cat); setRepairLevel('brands'); loadLevel('brands')
  }
  function selectBrand(brand: ServiceBrand) {
    setRepairBrand(brand); setRepairLevel('devices'); loadLevel('devices', brand.id)
  }
  function selectDevice(dev: ServiceDevice) {
    setRepairDevice(dev); setRepairLevel('problems'); setSelectedProblems([]); loadLevel('problems', dev.id)
  }
  function toggleProblem(prob: ServiceProblem) {
    setSelectedProblems(prev => {
      const exists = prev.find(p => p.id === prob.id)
      const next = exists ? prev.filter(p => p.id !== prob.id) : [...prev, prob]
      setRepairDetails(d => ({ ...d, repair_charges: next.reduce((s, p) => s + p.price, 0) }))
      return next
    })
  }

  async function goToDetailsStep() {
    if (!activeBranch) return
    setRepairLevel('details')
    const res = await fetch(`/api/employees?branch_id=${activeBranch.id}&limit=100`)
    const j = await res.json()
    setEmployees((j.data ?? []).map((e: any) => ({ id: e.id, full_name: e.full_name ?? `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() })))
    const warranties: Record<string, string> = {}
    selectedProblems.forEach(p => { warranties[p.id] = 'No Warranty' })
    setRepairDetails(d => ({ ...d, problem_warranties: warranties }))
  }

  async function confirmRepair() {
    if (!activeBranch) return
    setConfirmingRepair(true)
    try {
      const payload = {
        branch_id: activeBranch.id,
        customer_id: pos.customer?.id ?? null,
        device_type: repairCategory?.name ?? null,
        device_brand: repairBrand?.name ?? null,
        device_model: repairDevice?.name ?? null,
        serial_number: repairDetails.serial_number || null,
        issue: selectedProblems.map(p => p.name).join(', ') || 'Repair',
        estimated_cost: repairDetails.repair_charges,
        deposit_paid: repairDetails.charge_deposit ? repairDetails.deposit_amount : 0,
        notify_customer: !!pos.customer,
        is_rush: repairDetails.is_rush,
        assigned_to: repairDetails.assigned_to || null,
        lock_type: repairDetails.lock_type || null,
        passcode: repairDetails.passcode || null,
        custom_fields: repairCustomFields,
        parts: [],
      }
      const res = await fetch('/api/repairs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const j = await res.json()
        const repair = j.data
        const deviceLabel = [repairBrand?.name, repairDevice?.name].filter(Boolean).join(' ')
        const problemLabel = selectedProblems.map(p => p.name).join(', ')
        const serviceTotal = selectedProblems.reduce((s, p) => s + p.price, 0)
        const virtualProduct = {
          id: repair.id,
          name: `${deviceLabel} — ${problemLabel}`,
          selling_price: serviceTotal,
          cost_price: selectedProblems.reduce((s, p) => s + p.cost, 0),
          is_service: true, show_on_pos: true,
          business_id: activeBranch.id,
          sku: repair.job_number ?? null,
          barcode: null, image_url: null, brand_id: null, category_id: null,
          description: null, tax_class: null, track_stock: false, is_serialized: false,
          valuation_method: 'weighted_average', is_active: true,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        } as unknown as Product
        pos.addToCart(virtualProduct)
        resetRepairs()
      }
    } finally {
      setConfirmingRepair(false)
    }
  }

  // ── Filtered items ─────────────────────────────────────────────────────────
  const filteredRepairItems = repairItems.filter(item =>
    !repairSearch || item.name.toLowerCase().includes(repairSearch.toLowerCase())
  )

  // ── Breadcrumb ─────────────────────────────────────────────────────────────
  function RepairBreadcrumb() {
    const all: RepairLevel[] = ['categories', 'brands', 'devices', 'problems', 'details']
    const currentIdx = all.indexOf(repairLevel)
    return (
      <div className="flex items-center gap-1 flex-wrap text-xs">
        {all.map((lvl, i) => {
          const label = i === 0 ? (repairCategory?.name ?? 'Category')
            : i === 1 ? (repairBrand?.name ?? 'Brand')
            : i === 2 ? (repairDevice?.name ?? 'Devices')
            : LEVEL_LABELS[lvl]!
          const isCurrent = i === currentIdx
          const isPast = i < currentIdx
          return (
            <span key={lvl} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 text-gray-400 shrink-0" />}
              <button
                onClick={() => {
                  if (!isPast) return
                  if (lvl === 'categories') resetRepairs()
                  else if (lvl === 'brands') { setRepairLevel('brands'); loadLevel('brands') }
                  else if (lvl === 'devices' && repairBrand) { setRepairLevel('devices'); loadLevel('devices', repairBrand.id) }
                  else if (lvl === 'problems' && repairDevice) { setRepairLevel('problems'); loadLevel('problems', repairDevice.id) }
                }}
                className={`whitespace-nowrap ${isCurrent ? 'font-bold text-brand-teal' : isPast ? 'text-blue-500 hover:underline cursor-pointer' : 'text-gray-300 cursor-default'}`}
              >
                {label}
              </button>
            </span>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Breadcrumb + top controls */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-2.5">
        <RepairBreadcrumb />
        {repairLevel === 'problems' && (
          <button
            onClick={goToDetailsStep}
            disabled={selectedProblems.length === 0}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-teal px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-dark disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Next <ArrowRight className="h-4 w-4" />
          </button>
        )}
        {repairLevel === 'details' && (
          <div className="flex shrink-0 items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setRepairDetailsMenuOpen(o => !o)}
                className="flex h-8 w-8 items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {repairDetailsMenuOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-gray-200 bg-white shadow-lg">
                  <button
                    onClick={() => { setRepairDetailsMenuOpen(false); router.push('/settings/services') }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <ClipboardList className="h-3.5 w-3.5" /> Manage Custom Fields
                  </button>
                </div>
              )}
            </div>
            <Button className="bg-brand-teal hover:bg-brand-teal-dark text-sm px-4 py-1.5 h-8" loading={confirmingRepair} onClick={confirmRepair}>
              Confirm
            </Button>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* CATEGORIES / BRANDS / DEVICES grid */}
        {(repairLevel === 'categories' || repairLevel === 'brands' || repairLevel === 'devices') && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={`Search ${repairLevel === 'categories' ? 'category' : repairLevel === 'brands' ? 'brand' : 'device'}...`}
                value={repairSearch} onChange={e => setRepairSearch(e.target.value)}
                className="h-10 w-full max-w-xs rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-base focus:border-brand-teal focus:outline-none"
              />
            </div>
            {repairLoading ? (
              <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-200" />)}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                <button
                  onClick={() => router.push('/settings/services')}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-teal-light bg-brand-teal p-4 text-white hover:bg-brand-teal-dark transition-colors min-h-[100px]"
                >
                  <Plus className="h-7 w-7" />
                  <span className="text-sm font-medium">
                    Add {repairLevel === 'categories' ? 'Category' : repairLevel === 'brands' ? 'Brand' : 'Devices'}
                  </span>
                </button>
                {filteredRepairItems.map((item: any) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (repairLevel === 'categories') selectCategory(item)
                      else if (repairLevel === 'brands') selectBrand(item)
                      else selectDevice(item)
                    }}
                    className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-center hover:border-brand-teal hover:shadow-sm transition-all min-h-[100px]"
                  >
                    {(item.image_url ?? item.logo_url) ? (
                      <img src={item.image_url ?? item.logo_url} alt={item.name} className="h-11 w-11 object-contain" />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100">
                        {repairLevel === 'categories' && <Wrench className="h-6 w-6 text-gray-400" />}
                        {repairLevel === 'brands'     && <Tag    className="h-6 w-6 text-gray-400" />}
                        {repairLevel === 'devices'    && <ShoppingBag className="h-6 w-6 text-gray-400" />}
                      </div>
                    )}
                    <span className="text-sm font-medium text-gray-800 line-clamp-2 leading-tight">{item.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PROBLEMS step */}
        {repairLevel === 'problems' && (
          <div className="space-y-3">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text" placeholder="Search device problem"
                value={repairSearch} onChange={e => setRepairSearch(e.target.value)}
                className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-base focus:border-brand-teal focus:outline-none"
              />
            </div>
            {repairLoading ? (
              <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-200" />)}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                <button
                  onClick={() => router.push('/settings/services')}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-teal-light bg-brand-teal p-4 text-white hover:bg-brand-teal-dark transition-colors min-h-[130px]"
                >
                  <Plus className="h-7 w-7" />
                  <span className="text-sm font-medium">Add Device Issue</span>
                </button>
                {filteredRepairItems.map((prob: ServiceProblem) => {
                  const isSelected = selectedProblems.some(p => p.id === prob.id)
                  return (
                    <button
                      key={prob.id}
                      onClick={() => toggleProblem(prob)}
                      className={`relative flex flex-col items-center gap-2 rounded-xl border-2 bg-white p-3 text-center transition-all min-h-[100px] ${
                        isSelected ? 'border-brand-teal bg-brand-teal-light' : 'border-gray-200 hover:border-brand-teal-light'
                      }`}
                    >
                      <div className={`absolute left-2 top-2 flex h-4 w-4 items-center justify-center rounded border ${isSelected ? 'border-brand-teal bg-brand-teal' : 'border-gray-300 bg-white'}`}>
                        {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 mt-2">
                        <Wrench className="h-5 w-5 text-gray-400" />
                      </div>
                      <span className="text-sm font-medium text-gray-800 line-clamp-2 leading-tight">{prob.name}</span>
                      <span className="text-sm font-bold text-brand-teal">{formatCurrency(prob.price)}</span>
                    </button>
                  )
                })}
              </div>
            )}
            {selectedProblems.length > 0 && (
              <div className="rounded-lg bg-brand-teal-light border border-brand-teal-light px-4 py-2.5 text-sm font-medium text-brand-teal">
                {selectedProblems.length} service(s) selected · Total: <strong>{formatCurrency(selectedProblems.reduce((s, p) => s + p.price, 0))}</strong>
              </div>
            )}
          </div>
        )}

        {/* DETAILS step */}
        {repairLevel === 'details' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
            {/* Left column */}
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  <ClipboardList className="h-4 w-4" /> Pre-Repair Checklist
                </button>
                <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  <Camera className="h-4 w-4" /> Pre-Repair Condition Images
                </button>
              </div>

              {/* IMEI / Serial */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <select
                    value={repairDetails.imei_type}
                    onChange={e => setRepairDetails(d => ({ ...d, imei_type: e.target.value as 'Serial' | 'IMEI' }))}
                    className="h-10 rounded border border-gray-200 bg-white px-2 text-sm focus:border-brand-teal focus:outline-none"
                  >
                    <option>Serial</option>
                    <option>IMEI</option>
                  </select>
                  <input
                    type="text" placeholder={`Enter ${repairDetails.imei_type} number`}
                    value={repairDetails.serial_number}
                    onChange={e => setRepairDetails(d => ({ ...d, serial_number: e.target.value }))}
                    className="h-10 flex-1 rounded border border-gray-200 bg-white px-3 text-sm focus:border-brand-teal focus:outline-none"
                  />
                </div>
                {/* Passcode / Pattern toggle */}
                <div className="space-y-2">
                  <div className="flex overflow-hidden rounded-lg border border-gray-200">
                    <button
                      type="button"
                      onClick={() => setRepairDetails(d => ({ ...d, lock_type: 'passcode', passcode: '' }))}
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${repairDetails.lock_type === 'passcode' ? 'bg-brand-teal text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                    >Passcode</button>
                    <button
                      type="button"
                      onClick={() => setRepairDetails(d => ({ ...d, lock_type: 'pattern', passcode: '' }))}
                      className={`flex-1 py-2 text-sm font-medium border-l border-gray-200 transition-colors ${repairDetails.lock_type === 'pattern' ? 'bg-brand-teal text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                    >Pattern Lock</button>
                  </div>
                  {repairDetails.lock_type === 'passcode' && (
                    <input
                      type="text" placeholder="Enter device passcode"
                      value={repairDetails.passcode}
                      onChange={e => setRepairDetails(d => ({ ...d, passcode: e.target.value }))}
                      className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm focus:border-brand-teal focus:outline-none"
                    />
                  )}
                  {repairDetails.lock_type === 'pattern' && (
                    <PatternLock
                      size={200}
                      value={repairDetails.passcode}
                      onChange={pattern => setRepairDetails(d => ({ ...d, passcode: pattern }))}
                    />
                  )}
                </div>
              </div>

              {/* Warranty per problem */}
              {selectedProblems.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                  <p className="text-sm font-semibold text-gray-700">Warranty Applicable</p>
                  {selectedProblems.map(prob => (
                    <div key={prob.id}>
                      <p className="text-sm font-medium text-brand-teal mb-1">{prob.name}</p>
                      <select
                        value={repairDetails.problem_warranties[prob.id] ?? 'No Warranty'}
                        onChange={e => setRepairDetails(d => ({ ...d, problem_warranties: { ...d.problem_warranties, [prob.id]: e.target.value } }))}
                        className="h-10 w-full rounded border border-gray-200 bg-white px-2 text-sm focus:border-brand-teal focus:outline-none"
                      >
                        {WARRANTY_OPTIONS.map(w => <option key={w}>{w}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {/* Assigned to + Due date */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Assigned to</label>
                  <select
                    value={repairDetails.assigned_to}
                    onChange={e => setRepairDetails(d => ({ ...d, assigned_to: e.target.value }))}
                    className="h-10 w-full rounded border border-gray-200 bg-white px-2 text-sm focus:border-brand-teal focus:outline-none"
                  >
                    <option value="">Unassigned</option>
                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Task Due Date &amp; Time</label>
                  <input
                    type="datetime-local"
                    value={repairDetails.due_date}
                    onChange={e => setRepairDetails(d => ({ ...d, due_date: e.target.value }))}
                    className="h-10 w-full rounded border border-gray-200 bg-white px-2 text-sm focus:border-brand-teal focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              {/* Repair charges */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Repair Charges</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={repairDetails.repair_charges}
                    onChange={e => setRepairDetails(d => ({ ...d, repair_charges: parseFloat(e.target.value) || 0 }))}
                    className="h-10 w-28 rounded border border-gray-200 px-2 text-right text-base font-bold focus:border-brand-teal focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox" id="charge_deposit"
                    checked={repairDetails.charge_deposit}
                    onChange={e => {
                      const checked = e.target.checked
                      setRepairDetails(d => ({ ...d, charge_deposit: checked, deposit_amount: checked ? Math.round(d.repair_charges * 0.2 * 100) / 100 : 0 }))
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-brand-teal"
                  />
                  <label htmlFor="charge_deposit" className="text-sm font-medium text-gray-700">Charge Deposit</label>
                </div>
                {repairDetails.charge_deposit && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Deposit</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={repairDetails.deposit_amount}
                        onChange={e => setRepairDetails(d => ({ ...d, deposit_amount: parseFloat(e.target.value) || 0 }))}
                        className="h-7 w-24 rounded border border-gray-200 px-2 text-right text-sm focus:border-brand-teal focus:outline-none"
                      />
                    </div>
                    <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">20% of Repair Charges</p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox" id="rush_job"
                    checked={repairDetails.is_rush}
                    onChange={e => setRepairDetails(d => ({ ...d, is_rush: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-brand-teal"
                  />
                  <label htmlFor="rush_job" className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    Mark as Rush Job
                    <span className="rounded bg-brand-teal-light px-1.5 py-0.5 text-xs font-semibold text-brand-teal">New</span>
                  </label>
                </div>
              </div>

              {/* Status + location + type */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Repair Task Status</label>
                  <select
                    value={repairDetails.status}
                    onChange={e => setRepairDetails(d => ({ ...d, status: e.target.value }))}
                    className="h-10 w-full rounded border border-gray-200 bg-blue-600 px-2 text-sm text-white focus:outline-none"
                  >
                    {REPAIR_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Device Physical Location</label>
                  <input
                    type="text" placeholder="Select Physical Location"
                    value={repairDetails.physical_location}
                    onChange={e => setRepairDetails(d => ({ ...d, physical_location: e.target.value }))}
                    className="h-10 w-full rounded border border-gray-200 px-2 text-sm focus:border-brand-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Repair Task Type</label>
                  <select
                    value={repairDetails.task_type}
                    onChange={e => setRepairDetails(d => ({ ...d, task_type: e.target.value }))}
                    className="h-10 w-full rounded border border-gray-200 bg-white px-2 text-sm focus:border-brand-teal focus:outline-none"
                  >
                    {TASK_TYPE_OPTIONS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Device Network</label>
                  <input
                    type="text" placeholder="Select Network"
                    className="h-10 w-full rounded border border-gray-200 px-2 text-sm focus:border-brand-teal focus:outline-none"
                  />
                </div>
              </div>

              {/* Custom Fields */}
              {repairCustomFieldDefs.length > 0 && (
                <div className="rounded-xl border border-brand-teal-light bg-brand-teal-light p-4 space-y-3">
                  <p className="text-xs font-semibold text-brand-teal-dark">Additional Fields</p>
                  <CustomFieldRenderer
                    values={repairCustomFields}
                    definitions={repairCustomFieldDefs}
                    onSave={async v => setRepairCustomFields(v)}
                    showSave={false}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
