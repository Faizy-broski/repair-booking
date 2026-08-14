'use client'
import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Wrench, Lock, Banknote, Wallet, Star, X, StickyNote, User, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth.store'
import { usePosStore } from '@/store/pos.store'
import { formatCurrency, getCurrencySymbol } from '@/lib/utils'
import { PatternLock } from '@/components/ui/pattern-lock'
import { CreatableCombobox } from '@/components/ui/creatable-combobox'
import { MultiComboInput } from '@/components/shared/multi-combo-input'
import { CustomFieldRenderer, useCustomFieldDefs } from '@/components/shared/custom-field-renderer'
import { AsyncEmployeeSelect } from '@/components/shared/async-employee-select'
import { toast } from 'sonner'
import { printRepairInvoiceById } from '@/components/repairs/receipt-print'
import { buildPaymentSplits, paymentSplitTotal } from '@/lib/payment-splits'
import { TASK_TYPE_OPTIONS, type RepairDetailsForm, type RepairLineItem } from '../_types'

interface RepairCustomStatus { id: string; name: string; color: string }
interface RepairFault { id: string; name: string }
interface RepairMeta { customStatuses: RepairCustomStatus[]; faults: RepairFault[] }
type DeviceData = {
  types: string[]; brands: string[]; models: string[]
  raw: { device_type: string | null; device_brand: string | null; device_model: string | null }[]
  brandIdMap: Record<string, string>; typeIdMap: Record<string, string>; modelIdMap: Record<string, string>
}

const EMPTY_DETAILS: RepairDetailsForm = {
  device_type: '', device_brand: '', device_model: '', serial_number: '',
  faults: [], job_fee: '', estimated_cost: '', deposit_paid: '', price_pending: false,
  due_date: '', status: '', assigned_to: '',
  lock_type: '', passcode: '',
  payment_methods: [], payment_amounts: { cash: '', card: '' }, credit_apply_input: '', loyalty_apply_input: '',
  is_rush: false, physical_location: '', task_type: 'In-Store', device_network: '',
}

const inp = 'h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm focus:border-brand-teal focus:outline-none'
const sel = inp
const lbl = 'mb-1 block text-sm font-medium text-gray-700'

export function RepairsTab() {
  const { activeBranch } = useAuthStore()
  const pos = usePosStore()
  const queryClient = useQueryClient()

  const [repairDetails, setRepairDetails] = useState<RepairDetailsForm>(EMPTY_DETAILS)
  const [repairParts, setRepairParts]     = useState<RepairLineItem[]>([])
  const [confirmingRepair, setConfirmingRepair] = useState(false)
  const [success, setSuccess] = useState(false)
  const [deviceError, setDeviceError]     = useState('')
  const [faultError, setFaultError]       = useState('')
  const [chargesError, setChargesError]   = useState('')
  const [repairCustomFields, setRepairCustomFields] = useState<Record<string, unknown>>({})
  const { defs: repairCustomFieldDefs } = useCustomFieldDefs('repairs', repairDetails.device_type || undefined)

  // ── Repair parts search ────────────────────────────────────────────────────
  const [partQuery, setPartQuery]           = useState('')
  const [partResults, setPartResults]       = useState<Array<{ id: string; name: string; selling_price: number | null; cost_price: number | null; on_hand?: number; is_service?: boolean }>>([])
  const [showPartDrop, setShowPartDrop]     = useState(false)
  const [partSearchLoading, setPartSearchLoading] = useState(false)
  const partSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const partDropRef   = useRef<HTMLDivElement>(null)
  const [quickPartPrice, setQuickPartPrice] = useState('')
  const [quickPartCost, setQuickPartCost]   = useState('')

  // ── Store credit / loyalty balances for pos.customer ───────────────────────
  const [creditBalance, setCreditBalance]   = useState<number | null>(null)
  const [loyaltyBalance, setLoyaltyBalance] = useState<number | null>(null)
  const [loyaltyRate, setLoyaltyRate]       = useState(0.01)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (partDropRef.current && !partDropRef.current.contains(e.target as Node)) setShowPartDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!pos.customer) { setCreditBalance(null); setLoyaltyBalance(null); return }
    const id = pos.customer.id
    fetch(`/api/customers/${id}/store-credits`).then(r => r.json()).then(j => setCreditBalance(j.data?.balance ?? 0)).catch(() => {})
    fetch(`/api/customers/${id}/loyalty`).then(r => r.json()).then(j => {
      setLoyaltyBalance(j.data?.balance ?? 0)
      setLoyaltyRate(j.data?.redeem_rate ?? 0.01)
    }).catch(() => {})
  }, [pos.customer])

  // Auto-populate total charges = job fee + parts total
  useEffect(() => {
    setRepairDetails(prev => {
      const partsTotal = repairParts.reduce((s, p) => s + p.unit_price * p.qty, 0)
      const fee = parseFloat(prev.job_fee) || 0
      return { ...prev, estimated_cost: (fee + partsTotal).toFixed(2) }
    })
  }, [repairParts])

  // ── Meta: custom statuses + faults (shared cache with the main Repairs module) ──
  const { data: metaData } = useQuery<RepairMeta>({
    queryKey: ['repairs-meta', activeBranch?.id],
    queryFn: async () => {
      const res = await fetch(`/api/repairs/meta?branch_id=${activeBranch!.id}`)
      const j = await res.json()
      return j.data || { customStatuses: [], faults: [] }
    },
    enabled: !!activeBranch,
    staleTime: Infinity,
  })
  const customStatuses = metaData?.customStatuses ?? []
  const faults         = metaData?.faults ?? []

  // ── Device catalogue (same source as the main Repairs module) ─────────────
  const { data: deviceData = { types: [], brands: [], models: [], raw: [], brandIdMap: {}, typeIdMap: {}, modelIdMap: {} } } = useQuery<DeviceData>({
    queryKey: ['device-data', activeBranch?.id],
    queryFn: async () => {
      const res = await fetch(`/api/repairs/devices?branch_id=${activeBranch!.id}`)
      const j = await res.json()
      return j.data || { types: [], brands: [], models: [], raw: [], brandIdMap: {}, typeIdMap: {}, modelIdMap: {} }
    },
    enabled: !!activeBranch,
    staleTime: Infinity,
  })

  function searchParts(q: string) {
    if (partSearchRef.current) clearTimeout(partSearchRef.current)
    if (!q.trim()) { setPartResults([]); setShowPartDrop(false); return }
    setPartSearchLoading(true)
    partSearchRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ branch_id: activeBranch!.id, search: q, limit: '8' })
        const res = await fetch(`/api/products?${params}`)
        const json = await res.json()
        setPartResults(json.data ?? [])
        setShowPartDrop(true)
      } finally {
        setPartSearchLoading(false)
      }
    }, 300)
  }

  function addPartFromInventory(p: { id: string; name: string; selling_price: number | null; cost_price: number | null; on_hand?: number; is_service?: boolean }) {
    const maxStock = p.is_service ? null : (p.on_hand ?? 0)
    setRepairParts(prev => {
      const existing = prev.find(r => r.product_id === p.id)
      if (existing) {
        const cap = existing.max_stock ?? Infinity
        if (existing.qty >= cap) {
          toast.error(`Only ${cap} in stock for "${existing.name}"`)
          return prev
        }
        return prev.map(r => r.product_id === p.id ? { ...r, qty: Math.min(r.qty + 1, cap) } : r)
      }
      if (maxStock !== null && maxStock <= 0) {
        toast.error(`"${p.name}" is out of stock`)
        return prev
      }
      return [...prev, { tempId: Math.random().toString(36).slice(2), product_id: p.id, name: p.name, qty: 1, unit_price: p.selling_price ?? 0, unit_cost: p.cost_price ?? 0, max_stock: maxStock }]
    })
    setPartQuery(''); setPartResults([]); setShowPartDrop(false)
  }

  function addQuickPart() {
    const name = partQuery.trim()
    const price = parseFloat(quickPartPrice) || 0
    const cost  = parseFloat(quickPartCost)  || 0
    if (!name) return
    setRepairParts(prev => [...prev, { tempId: Math.random().toString(36).slice(2), product_id: null, name, qty: 1, unit_price: price, unit_cost: cost, max_stock: null }])
    setPartQuery(''); setQuickPartPrice(''); setQuickPartCost(''); setShowPartDrop(false)
  }

  // ── Inline device-catalogue creators (same endpoints the main Repairs module hits) ──
  async function createDeviceType(name: string) {
    if (!activeBranch) return
    setRepairDetails(d => ({ ...d, device_type: name, device_brand: '', device_model: '' }))
    queryClient.setQueryData<DeviceData>(['device-data', activeBranch.id], old => {
      if (!old || old.types.includes(name)) return old
      return { ...old, types: [...old.types, name] }
    })
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    try {
      const res = await fetch('/api/services/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, display_order: 0, show_on_pos: true, retail_margin: 0 }),
      })
      if (res.ok) {
        const json = await res.json()
        const newId = json.data?.id
        if (newId) {
          queryClient.setQueryData<DeviceData>(['device-data', activeBranch.id], old => old ? { ...old, typeIdMap: { ...old.typeIdMap, [name]: newId } } : old)
        } else {
          queryClient.invalidateQueries({ queryKey: ['device-data'] })
        }
      }
    } catch { /* fire-and-forget */ }
  }

  async function createDeviceBrand(name: string) {
    if (!activeBranch) return
    const deviceType = repairDetails.device_type
    setRepairDetails(d => ({ ...d, device_brand: name, device_model: '' }))
    queryClient.setQueryData<DeviceData>(['device-data', activeBranch.id], old => {
      if (!old || old.brands.includes(name)) return old
      const newRaw = deviceType ? [...old.raw, { device_type: deviceType, device_brand: name, device_model: null }] : old.raw
      return { ...old, brands: [...old.brands, name], raw: newRaw }
    })
    const categoryId = deviceType ? (deviceData.typeIdMap ?? {})[deviceType] : undefined
    try {
      const res = await fetch('/api/services/manufacturers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ...(categoryId ? { category_id: categoryId } : {}) }),
      })
      if (res.ok) {
        const json = await res.json()
        const newId = json.data?.id
        if (newId) {
          queryClient.setQueryData<DeviceData>(['device-data', activeBranch.id], old => old ? { ...old, brandIdMap: { ...old.brandIdMap, [name]: newId } } : old)
        } else {
          queryClient.invalidateQueries({ queryKey: ['device-data'] })
        }
      }
    } catch { /* fire-and-forget */ }
  }

  function createDeviceModel(name: string) {
    if (!activeBranch) return
    const deviceBrand = repairDetails.device_brand
    const deviceType  = repairDetails.device_type
    setRepairDetails(d => ({ ...d, device_model: name }))
    queryClient.setQueryData<DeviceData>(['device-data', activeBranch.id], old => {
      if (!old || old.models.includes(name)) return old
      const newRaw = [...old.raw, { device_type: deviceType || null, device_brand: deviceBrand || null, device_model: name }]
      return { ...old, models: [...old.models, name], raw: newRaw }
    })
    if (deviceBrand) {
      const manufacturerId = (deviceData.brandIdMap ?? {})[deviceBrand]
      const categoryId     = deviceType ? (deviceData.typeIdMap ?? {})[deviceType] : undefined
      if (manufacturerId) {
        fetch('/api/services/devices', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, manufacturer_id: manufacturerId, ...(categoryId ? { category_id: categoryId } : {}) }),
        }).then(res => { if (res.ok) queryClient.invalidateQueries({ queryKey: ['device-data'] }) }).catch(() => {})
      }
    }
  }

  // ── Rename/Delete for Device Catalogue (Type/Brand/Model) ──────────────────
  async function renameDeviceType(oldName: string, newName: string) {
    if (!activeBranch) return
    const id = (deviceData.typeIdMap ?? {})[oldName]
    if (!id) { toast.error('Could not find this type to rename.'); return }
    const res = await fetch(`/api/services/categories/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName }),
    })
    if (!res.ok) { toast.error('Failed to rename type. Please try again.'); return }
    queryClient.setQueryData<DeviceData>(['device-data', activeBranch.id], old => {
      if (!old) return old
      const newMap = { ...(old.typeIdMap || {}) }
      if (newMap[oldName]) {
        newMap[newName] = newMap[oldName]
        delete newMap[oldName]
      }
      return {
        ...old,
        types: old.types.map(v => v === oldName ? newName : v),
        raw: old.raw.map(r => r.device_type === oldName ? { ...r, device_type: newName } : r),
        typeIdMap: newMap
      }
    })
    if (repairDetails.device_type === oldName) setRepairDetails(d => ({ ...d, device_type: newName }))
    toast.success('Type renamed.')
  }

  async function deleteDeviceType(name: string) {
    if (!activeBranch) return
    const id = (deviceData.typeIdMap ?? {})[name]
    if (!id) { toast.error('Could not find this type to delete.'); return }
    const res = await fetch(`/api/services/categories/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete type. It may still be in use.'); return }
    queryClient.setQueryData<DeviceData>(['device-data', activeBranch.id], old => {
      if (!old) return old
      return { ...old, types: old.types.filter(v => v !== name) }
    })
    if (repairDetails.device_type === name) setRepairDetails(d => ({ ...d, device_type: '', device_brand: '', device_model: '' }))
    toast.success('Type deleted.')
  }

  async function renameDeviceBrand(oldName: string, newName: string) {
    if (!activeBranch) return
    const id = (deviceData.brandIdMap ?? {})[oldName]
    if (!id) { toast.error('Could not find this brand to rename.'); return }
    const res = await fetch(`/api/services/manufacturers/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName }),
    })
    if (!res.ok) { toast.error('Failed to rename brand. Please try again.'); return }
    queryClient.setQueryData<DeviceData>(['device-data', activeBranch.id], old => {
      if (!old) return old
      const newMap = { ...(old.brandIdMap || {}) }
      if (newMap[oldName]) {
        newMap[newName] = newMap[oldName]
        delete newMap[oldName]
      }
      return {
        ...old,
        brands: old.brands.map(v => v === oldName ? newName : v),
        raw: old.raw.map(r => r.device_brand === oldName ? { ...r, device_brand: newName } : r),
        brandIdMap: newMap
      }
    })
    if (repairDetails.device_brand === oldName) setRepairDetails(d => ({ ...d, device_brand: newName }))
    toast.success('Brand renamed.')
  }

  async function deleteDeviceBrand(name: string) {
    if (!activeBranch) return
    const id = (deviceData.brandIdMap ?? {})[name]
    if (!id) { toast.error('Could not find this brand to delete.'); return }
    const res = await fetch(`/api/services/manufacturers/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete brand. It may still be in use.'); return }
    queryClient.setQueryData<DeviceData>(['device-data', activeBranch.id], old => {
      if (!old) return old
      return { ...old, brands: old.brands.filter(v => v !== name) }
    })
    if (repairDetails.device_brand === name) setRepairDetails(d => ({ ...d, device_brand: '', device_model: '' }))
    toast.success('Brand deleted.')
  }

  async function renameDeviceModel(oldName: string, newName: string) {
    if (!activeBranch) return
    const id = (deviceData.modelIdMap ?? {})[oldName]
    if (!id) { toast.error('Could not find this model to rename.'); return }
    const res = await fetch(`/api/services/devices/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName }),
    })
    if (!res.ok) { toast.error('Failed to rename model. Please try again.'); return }
    queryClient.setQueryData<DeviceData>(['device-data', activeBranch.id], old => {
      if (!old) return old
      const newMap = { ...(old.modelIdMap || {}) }
      if (newMap[oldName]) {
        newMap[newName] = newMap[oldName]
        delete newMap[oldName]
      }
      return {
        ...old,
        models: old.models.map(v => v === oldName ? newName : v),
        raw: old.raw.map(r => r.device_model === oldName ? { ...r, device_model: newName } : r),
        modelIdMap: newMap
      }
    })
    if (repairDetails.device_model === oldName) setRepairDetails(d => ({ ...d, device_model: newName }))
    toast.success('Model renamed.')
  }

  async function deleteDeviceModel(name: string) {
    if (!activeBranch) return
    const id = (deviceData.modelIdMap ?? {})[name]
    if (!id) { toast.error('Could not find this model to delete.'); return }
    const res = await fetch(`/api/services/devices/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete model. It may still be in use.'); return }
    queryClient.setQueryData<DeviceData>(['device-data', activeBranch.id], old => {
      if (!old) return old
      return { ...old, models: old.models.filter(v => v !== name) }
    })
    if (repairDetails.device_model === name) setRepairDetails(d => ({ ...d, device_model: '' }))
    toast.success('Model deleted.')
  }

  const filteredBrands = repairDetails.device_type
    ? [...new Set(deviceData.raw.filter(d => d.device_type === repairDetails.device_type).map(d => d.device_brand).filter(Boolean) as string[])]
    : deviceData.brands

  const filteredModels = repairDetails.device_brand
    ? [...new Set(deviceData.raw.filter(d => d.device_brand === repairDetails.device_brand).map(d => d.device_model).filter(Boolean) as string[])]
    : repairDetails.device_type
    ? [...new Set(deviceData.raw.filter(d => d.device_type === repairDetails.device_type).map(d => d.device_model).filter(Boolean) as string[])]
    : deviceData.models

  const pricePending = repairDetails.price_pending
  const remaining = (parseFloat(repairDetails.estimated_cost) || 0) - (parseFloat(repairDetails.deposit_paid) || 0)

  function resetForm() {
    setRepairDetails(EMPTY_DETAILS)
    setRepairParts([])
    setRepairCustomFields({})
    setDeviceError('')
    setFaultError('')
    setChargesError('')
  }

  async function confirmRepair() {
    if (!activeBranch) return
    if (!repairDetails.device_type || !repairDetails.device_brand || !repairDetails.device_model) {
      setDeviceError('Device Type, Brand and Model are all required.')
      return
    }
    setDeviceError('')
    if (repairDetails.faults.length === 0) {
      setFaultError('At least one fault is required.')
      return
    }
    setFaultError('')
    if (!repairDetails.price_pending) {
      const totalVal = parseFloat(repairDetails.estimated_cost)
      if (!repairDetails.estimated_cost.trim() || isNaN(totalVal) || totalVal < 0) {
        setChargesError('Total Charges is required and must be a valid amount.')
        return
      }
    }
    setChargesError('')
    setConfirmingRepair(true)
    // Must open synchronously here, before any `await` below — otherwise the
    // browser's popup blocker silently swallows the print window once we're
    // past the user-gesture call stack (see printRepairInvoiceById).
    const printWin = window.open('about:blank', '_blank', 'width=400,height=900,toolbar=0,location=0,menubar=0,status=0,scrollbars=1')
    try {
      const total   = parseFloat(repairDetails.estimated_cost) || 0
      const deposit = parseFloat(repairDetails.deposit_paid) || 0
      // Tells the backend which tender(s) the deposit was paid with, so it can
      // record repair_payments row(s) — without this the printed receipt has
      // nothing to show on its "Payment Method" line even though one was picked.
      const payment_splits = buildPaymentSplits(
        repairDetails.payment_methods, repairDetails.payment_amounts,
        repairDetails.credit_apply_input, repairDetails.loyalty_apply_input, loyaltyRate
      )
      const payload = {
        branch_id: activeBranch.id,
        customer_id: pos.customer?.id ?? null,
        issue: repairDetails.faults.join(', '),
        device_type: repairDetails.device_type || null,
        device_brand: repairDetails.device_brand || null,
        device_model: repairDetails.device_model || null,
        serial_number: repairDetails.serial_number || null,
        estimated_cost: total || null,
        deposit_paid: deposit,
        assigned_to: repairDetails.assigned_to || null,
        status: repairDetails.status || undefined,
        lock_type: repairDetails.lock_type || null,
        passcode: repairDetails.passcode.trim() || null,
        notify_customer: !!pos.customer,
        is_rush: repairDetails.is_rush,
        store_credit_applied: repairDetails.payment_methods.includes('store_credit') ? (parseFloat(repairDetails.credit_apply_input) || 0) : undefined,
        loyalty_points_applied: repairDetails.payment_methods.includes('loyalty_points') ? (parseInt(repairDetails.loyalty_apply_input) || 0) : undefined,
        payment_splits,
        custom_fields: {
          due_date: repairDetails.due_date || null,
          physical_location: repairDetails.physical_location || null,
          task_type: repairDetails.task_type || null,
          device_network: repairDetails.device_network || null,
          price_pending: repairDetails.price_pending || undefined,
          payment_method: repairDetails.payment_methods.length === 1
            ? repairDetails.payment_methods[0]
            : repairDetails.payment_methods.length > 1 ? 'split' : null,
          ...repairCustomFields,
        },
        parts: repairParts.map(p => ({ product_id: p.product_id, name: p.name, quantity: p.qty, unit_cost: p.unit_cost, unit_price: p.unit_price })),
      }
      const res = await fetch('/api/repairs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const j = await res.json()
        const repair = j.data
        // Job creation is a complete transaction on its own (deposit + tender
        // already captured above) — it never touches the POS cart.
        printRepairInvoiceById(repair.id, printWin)
        if (j.data?.credit_apply_warning) toast.error(j.data.credit_apply_warning)
        setSuccess(true)
        setTimeout(() => setSuccess(false), 2500)
        resetForm()
      } else {
        printWin?.close()
        const j = await res.json().catch(() => ({}))
        const errMsg = typeof j.error === 'string' ? j.error : (j.error?.message ?? 'Failed to create repair. Please try again.')
        toast.error(errMsg)
      }
    } catch (err) {
      printWin?.close()
      throw err
    } finally {
      setConfirmingRepair(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-gray-800">New Repair Job</p>
          <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${pos.customer ? 'bg-teal-50 text-brand-teal' : 'bg-gray-100 text-gray-400'}`}>
            <User className="h-3 w-3" />
            {pos.customer ? `${pos.customer.first_name} ${pos.customer.last_name ?? ''}`.trim() : 'No customer selected — walk-in'}
          </div>
        </div>
        <Button className="bg-brand-teal hover:bg-brand-teal-dark text-sm px-4 py-1.5 h-8" loading={confirmingRepair} onClick={confirmRepair}>
          Confirm
        </Button>
      </div>

      {/* Scrollable single-form content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl space-y-4">

          {/* DEVICE */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-brand-teal">
              <Wrench className="h-3 w-3" /> Device
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label className={lbl}>Type <span className="text-red-400">*</span></label>
                <CreatableCombobox
                  options={deviceData.types.map(t => ({ value: t, label: t }))}
                  value={repairDetails.device_type}
                  onChange={(v) => setRepairDetails(d => ({ ...d, device_type: v, device_brand: '', device_model: '' }))}
                  onCreate={createDeviceType}
                  onEdit={renameDeviceType}
                  onDelete={deleteDeviceType}
                  placeholder="Phone…"
                  createLabel="Add type"
                />
              </div>
              <div>
                <label className={`${lbl} flex items-center gap-1`}>
                  Brand <span className="text-red-400">*</span>
                  {!repairDetails.device_type && <Lock className="h-3 w-3 text-gray-300" />}
                </label>
                {repairDetails.device_type ? (
                  <CreatableCombobox
                    options={filteredBrands.map(b => ({ value: b, label: b }))}
                    value={repairDetails.device_brand}
                    onChange={(v) => setRepairDetails(d => ({ ...d, device_brand: v, device_model: '' }))}
                    onCreate={createDeviceBrand}
                    onEdit={renameDeviceBrand}
                    onDelete={deleteDeviceBrand}
                    placeholder="Apple…"
                    createLabel="Add brand"
                  />
                ) : (
                  <div className="flex h-10 w-full cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 text-sm text-gray-300 select-none">
                    <Lock className="h-3.5 w-3.5 shrink-0" /> Select type first
                  </div>
                )}
              </div>
              <div>
                <label className={`${lbl} flex items-center gap-1`}>
                  Model <span className="text-red-400">*</span>
                  {!repairDetails.device_brand && <Lock className="h-3 w-3 text-gray-300" />}
                </label>
                {repairDetails.device_brand ? (
                  <CreatableCombobox
                    options={filteredModels.map(m => ({ value: m, label: m }))}
                    value={repairDetails.device_model}
                    onChange={(v) => setRepairDetails(d => ({ ...d, device_model: v }))}
                    onCreate={createDeviceModel}
                    onEdit={renameDeviceModel}
                    onDelete={deleteDeviceModel}
                    placeholder="iPhone 15…"
                    createLabel="Add model"
                  />
                ) : (
                  <div className="flex h-10 w-full cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 text-sm text-gray-300 select-none">
                    <Lock className="h-3.5 w-3.5 shrink-0" /> Select brand first
                  </div>
                )}
              </div>
              <div>
                <label className={lbl}>IMEI / Serial</label>
                <input
                  value={repairDetails.serial_number}
                  onChange={(e) => setRepairDetails(d => ({ ...d, serial_number: e.target.value }))}
                  placeholder="Enter IMEI…"
                  className={inp}
                />
              </div>
            </div>
            {deviceError && (
              <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-500">{deviceError}</p>
            )}
          </div>

          {/* REPAIR PARTS */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-brand-teal">
              <Wrench className="h-3 w-3" /> Repair Parts
            </p>
            {(!repairDetails.device_type || !repairDetails.device_brand || !repairDetails.device_model) && (
              <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-600">
                Select Device Type, Brand and Model above to add repair parts.
              </p>
            )}
            <div className="relative" ref={partDropRef}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={partQuery}
                  onChange={(e) => { setPartQuery(e.target.value); searchParts(e.target.value) }}
                  onFocus={() => { if (partResults.length > 0 || partQuery.trim()) setShowPartDrop(true) }}
                  placeholder="Search inventory parts…"
                  className={`${inp} pl-9`}
                  disabled={!repairDetails.device_model}
                />
                {partSearchLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
                )}
              </div>

              {showPartDrop && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                  <ul className="max-h-44 overflow-y-auto py-1">
                    {partResults.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors"
                          onMouseDown={(e) => { e.preventDefault(); addPartFromInventory(p) }}
                        >
                          <span className="min-w-0 flex-1 truncate text-gray-700">{p.name}</span>
                          {!p.is_service && (
                            <span className={`shrink-0 text-xs font-medium ${(p.on_hand ?? 0) > 0 ? 'text-gray-400' : 'text-red-500'}`}>
                              {(p.on_hand ?? 0) > 0 ? `${p.on_hand} in stock` : 'Out of stock'}
                            </span>
                          )}
                          <span className="shrink-0 text-xs font-semibold text-teal-700">{formatCurrency(p.selling_price ?? 0)}</span>
                        </button>
                      </li>
                    ))}
                    {partQuery.trim() && (
                      <li className="border-t border-gray-100">
                        <div className="flex flex-col gap-1.5 px-3 py-2">
                          <span className="text-xs italic text-gray-500">Add &quot;{partQuery.trim()}&quot;</span>
                          <div className="flex items-center gap-2">
                            <div className="flex flex-1 flex-col gap-0.5">
                              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Cost {getCurrencySymbol()}</span>
                              <input
                                type="number" step="0.01" min="0"
                                value={quickPartCost}
                                onChange={(e) => setQuickPartCost(e.target.value)}
                                placeholder="0.00"
                                className="h-7 w-full rounded border border-gray-200 bg-gray-50 px-2 text-xs text-gray-900"
                                onMouseDown={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div className="flex flex-1 flex-col gap-0.5">
                              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Price {getCurrencySymbol()}</span>
                              <input
                                type="number" step="0.01" min="0"
                                value={quickPartPrice}
                                onChange={(e) => setQuickPartPrice(e.target.value)}
                                placeholder="0.00"
                                className="h-7 w-full rounded border border-gray-300 px-2 text-xs text-gray-900"
                                onMouseDown={(e) => e.stopPropagation()}
                              />
                            </div>
                            <button
                              type="button"
                              className="mt-4 shrink-0 rounded bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 transition-colors"
                              onMouseDown={(e) => { e.preventDefault(); addQuickPart() }}
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      </li>
                    )}
                    {partResults.length === 0 && !partSearchLoading && (
                      <li className="px-3 py-2 text-xs italic text-gray-400">
                        {partQuery.trim() ? 'No inventory parts found — use quick-add above.' : 'Type to search parts…'}
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            {repairParts.length > 0 && (
              <div className="mt-2 overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 font-semibold text-gray-500">
                      <th className="px-3 py-1.5 text-left">Part</th>
                      <th className="w-16 px-2 py-1.5 text-center">Qty</th>
                      <th className="w-20 px-2 py-1.5 text-right text-gray-400">Cost {getCurrencySymbol()}</th>
                      <th className="w-20 px-2 py-1.5 text-right">Price {getCurrencySymbol()}</th>
                      <th className="w-20 px-2 py-1.5 text-right">Total</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {repairParts.map((p) => (
                      <tr key={p.tempId} className="border-t border-gray-100">
                        <td className="px-3 py-1.5 text-gray-700">{p.name}</td>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="number" min="1" max={p.max_stock ?? undefined} value={p.qty}
                            onChange={(e) => setRepairParts(prev => prev.map(r => {
                              if (r.tempId !== p.tempId) return r
                              const cap = r.max_stock ?? Infinity
                              const requested = Math.max(1, parseInt(e.target.value) || 1)
                              if (requested > cap) toast.error(`Only ${cap} in stock for "${r.name}"`)
                              return { ...r, qty: Math.min(requested, cap) }
                            }))}
                            className="h-6 w-12 rounded border border-gray-200 px-1 text-center text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="number" step="0.01" min="0" value={p.unit_cost}
                            onChange={(e) => setRepairParts(prev => prev.map(r => r.tempId === p.tempId ? { ...r, unit_cost: parseFloat(e.target.value) || 0 } : r))}
                            className="h-6 w-16 rounded border border-gray-100 bg-gray-50 px-1 text-right text-xs text-gray-500"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="number" step="0.01" min="0" value={p.unit_price}
                            onChange={(e) => setRepairParts(prev => prev.map(r => r.tempId === p.tempId ? { ...r, unit_price: parseFloat(e.target.value) || 0 } : r))}
                            className="h-6 w-16 rounded border border-gray-200 px-1 text-right text-xs"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold text-gray-700">{formatCurrency(p.unit_price * p.qty)}</td>
                        <td className="px-1 py-1.5 text-center">
                          <button type="button" onClick={() => setRepairParts(prev => prev.filter(r => r.tempId !== p.tempId))} className="text-red-400 hover:text-red-600 transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50">
                      <td colSpan={4} className="px-3 py-1.5 text-right text-xs font-bold text-gray-600">Parts Total:</td>
                      <td className="px-2 py-1.5 text-right text-xs font-bold text-gray-900">{formatCurrency(repairParts.reduce((s, p) => s + p.unit_price * p.qty, 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* FAULT & ASSIGNMENT */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-brand-teal">
              <Wrench className="h-3 w-3" /> Fault &amp; Assignment
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <label className={lbl}>Fault <span className="text-red-400">*</span></label>
                <MultiComboInput
                  values={repairDetails.faults}
                  onAdd={(v) => {
                    setRepairDetails(p => ({ ...p, faults: [...p.faults, v] }))
                    const isNew = !faults.some(f => f.name.toLowerCase() === v.toLowerCase())
                    if (isNew) {
                      queryClient.setQueryData<RepairMeta>(['repairs-meta', activeBranch?.id], old => {
                        if (!old) return old
                        return { ...old, faults: [...old.faults, { id: `temp-${Date.now()}`, name: v }] }
                      })
                      fetch('/api/repairs/faults', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: v }),
                      }).then(r => { if (r.ok) queryClient.invalidateQueries({ queryKey: ['repairs-meta', activeBranch?.id] }) }).catch(() => {})
                    }
                  }}
                  onRemove={(v) => setRepairDetails(p => ({ ...p, faults: p.faults.filter(f => f !== v) }))}
                  options={faults.map(f => f.name)}
                  placeholder="Select or type fault…"
                />
                {faultError && <p className="mt-1 text-xs text-red-500">{faultError}</p>}
              </div>
              <div>
                <label className={lbl}>Due Date</label>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={repairDetails.due_date}
                  onChange={(e) => setRepairDetails(d => ({ ...d, due_date: e.target.value }))}
                  className={inp}
                />
              </div>
              <div>
                <label className={lbl}>Status</label>
                <select value={repairDetails.status} onChange={(e) => setRepairDetails(d => ({ ...d, status: e.target.value }))} className={sel}>
                  <option value="">— Status —</option>
                  {customStatuses.map(cs => <option key={cs.id} value={cs.name}>{cs.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* FINANCIALS & ASSIGNMENT */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-brand-teal">
              <Banknote className="h-3 w-3" /> Financials &amp; Assignment
            </p>
            <label className="mb-3 flex w-fit cursor-pointer items-center gap-2.5">
              <div
                onClick={() => setRepairDetails(p => ({ ...p, price_pending: !p.price_pending, estimated_cost: !p.price_pending ? '' : p.estimated_cost, deposit_paid: !p.price_pending ? '' : p.deposit_paid }))}
                className={`relative flex h-5 w-9 items-center rounded-full transition-colors ${pricePending ? 'bg-amber-500' : 'bg-gray-300'}`}
              >
                <span className={`absolute inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${pricePending ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-xs font-semibold text-gray-600">
                {pricePending ? (
                  <span className="flex items-center gap-1 text-amber-600"><span>⚠</span> Issue Not Found — Price TBD</span>
                ) : 'No fault found / Price TBD'}
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div>
                <label className={lbl}>Job Fee (Labour)</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{getCurrencySymbol()}</span>
                  <input
                    type="number" step="0.01" min="0" disabled={pricePending}
                    value={repairDetails.job_fee}
                    onChange={(e) => {
                      const fee = e.target.value
                      const partsTotal = repairParts.reduce((s, p) => s + p.unit_price * p.qty, 0)
                      const total = (parseFloat(fee) || 0) + partsTotal
                      setRepairDetails(p => ({ ...p, job_fee: fee, estimated_cost: total.toFixed(2) }))
                    }}
                    placeholder="0.00"
                    className={`${inp} pl-7 ${pricePending ? 'opacity-40 cursor-not-allowed' : ''}`}
                  />
                </div>
              </div>
              <div>
                <label className={lbl}>Total Charges {!pricePending && <span className="text-red-400">*</span>}</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{getCurrencySymbol()}</span>
                  <input
                    type="number" step="0.01" min="0" disabled={pricePending}
                    value={repairDetails.estimated_cost}
                    onChange={(e) => {
                      setRepairDetails(p => ({ ...p, estimated_cost: e.target.value }))
                      if (chargesError) {
                        const v = parseFloat(e.target.value)
                        setChargesError(!e.target.value.trim() || isNaN(v) || v < 0 ? 'Total Charges is required and must be a valid amount.' : '')
                      }
                    }}
                    onBlur={(e) => {
                      if (!pricePending) {
                        const v = parseFloat(e.target.value)
                        setChargesError(!e.target.value.trim() || isNaN(v) || v < 0 ? 'Total Charges is required and must be a valid amount.' : '')
                      }
                    }}
                    placeholder={pricePending ? 'TBD' : '0.00'}
                    className={`${inp} pl-7 ${pricePending ? 'opacity-40 cursor-not-allowed' : ''} ${chargesError ? 'border-red-400 focus:border-red-400' : ''}`}
                  />
                </div>
                {chargesError && <p className="mt-1 text-xs text-red-500">{chargesError}</p>}
              </div>
              <div>
                <label className={lbl}>Deposit</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{getCurrencySymbol()}</span>
                  <input
                    type="number" step="0.01" min="0" disabled={pricePending}
                    value={repairDetails.deposit_paid}
                    onChange={(e) => setRepairDetails(p => ({ ...p, deposit_paid: e.target.value }))}
                    placeholder={pricePending ? 'TBD' : '0.00'}
                    className={`${inp} pl-7 ${pricePending ? 'opacity-40 cursor-not-allowed' : ''}`}
                  />
                </div>
              </div>
              <div>
                <label className={lbl}>Remaining</label>
                <div className={`flex h-10 items-center rounded-lg border px-3 text-sm font-semibold ${
                  pricePending ? 'border-amber-200 bg-amber-50 text-amber-600'
                    : remaining > 0 ? 'border-orange-200 bg-orange-50 text-orange-600' : 'border-green-200 bg-green-50 text-green-600'
                }`}>
                  {pricePending ? 'TBD' : `${getCurrencySymbol()}${remaining.toFixed(2)}`}
                </div>
              </div>
              <div>
                <label className={lbl}>Assigned To</label>
                {activeBranch && (
                  <AsyncEmployeeSelect
                    branchId={activeBranch.id}
                    value={repairDetails.assigned_to}
                    onChange={(id) => setRepairDetails(d => ({ ...d, assigned_to: id }))}
                    label=""
                    placeholder="Search employee..."
                  />
                )}
              </div>
            </div>

            <div className="mt-3">
              <label className={lbl}>Payment Method <span className="font-normal normal-case text-gray-300">(opt, select multiple to split)</span></label>
              <div className="flex flex-wrap gap-2">
                {(['cash', 'card', 'store_credit', 'loyalty_points'] as const).map(m => {
                  const disabled = (m === 'store_credit' || m === 'loyalty_points') && !pos.customer
                  const active = repairDetails.payment_methods.includes(m)
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={disabled}
                      title={disabled ? 'Select a customer first' : undefined}
                      onClick={() => !disabled && setRepairDetails(p => {
                        const active = p.payment_methods.includes(m)
                        const payment_methods = active ? p.payment_methods.filter(x => x !== m) : [...p.payment_methods, m]
                        const payment_amounts = m === 'cash' || m === 'card' ? { ...p.payment_amounts, [m]: active ? '' : p.payment_amounts[m] } : p.payment_amounts
                        const credit_apply_input = m === 'store_credit' && active ? '' : p.credit_apply_input
                        const loyalty_apply_input = m === 'loyalty_points' && active ? '' : p.loyalty_apply_input
                        return { ...p, payment_methods, payment_amounts, credit_apply_input, loyalty_apply_input }
                      })}
                      className={`flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                        active
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : disabled
                            ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {m === 'store_credit' && <Wallet className="h-3 w-3" />}
                      {m === 'loyalty_points' && <Star className="h-3 w-3" />}
                      {m.replace('_', ' ')}
                    </button>
                  )
                })}
              </div>

              {repairDetails.payment_methods.includes('cash') && (
                <div className="mt-2">
                  <input
                    type="number" min="0" step="0.01" placeholder="Cash amount"
                    value={repairDetails.payment_amounts.cash}
                    onChange={(e) => setRepairDetails(p => ({ ...p, payment_amounts: { ...p.payment_amounts, cash: e.target.value } }))}
                    className={inp}
                  />
                </div>
              )}

              {repairDetails.payment_methods.includes('card') && (
                <div className="mt-2">
                  <input
                    type="number" min="0" step="0.01" placeholder="Card amount"
                    value={repairDetails.payment_amounts.card}
                    onChange={(e) => setRepairDetails(p => ({ ...p, payment_amounts: { ...p.payment_amounts, card: e.target.value } }))}
                    className={inp}
                  />
                </div>
              )}

              {repairDetails.payment_methods.includes('store_credit') && (
                <div className="mt-2 space-y-1.5">
                  {creditBalance !== null && (
                    <p className="text-xs text-gray-500">Available balance: <span className="font-semibold text-gray-800">{formatCurrency(creditBalance)}</span></p>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="number" min="0" step="0.01" placeholder="Amount to use"
                      value={repairDetails.credit_apply_input}
                      onChange={(e) => setRepairDetails(p => ({ ...p, credit_apply_input: e.target.value }))}
                      className={`${inp} flex-1`}
                    />
                    <Button variant="outline" size="sm" onClick={() => {
                      const due = parseFloat(repairDetails.deposit_paid) || 0
                      const amount = Math.min(parseFloat(repairDetails.credit_apply_input) || 0, creditBalance ?? 0, due)
                      setRepairDetails(p => ({ ...p, credit_apply_input: String(amount) }))
                    }}>Apply</Button>
                  </div>
                </div>
              )}

              {repairDetails.payment_methods.includes('loyalty_points') && (
                <div className="mt-2 space-y-1.5">
                  {loyaltyBalance !== null && (
                    <p className="text-xs text-gray-500">
                      Points balance: <span className="font-semibold text-gray-800">{loyaltyBalance} pts</span> (≈ {formatCurrency(loyaltyBalance * loyaltyRate)})
                    </p>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="number" min="0" step="1" placeholder="Points to redeem"
                      value={repairDetails.loyalty_apply_input}
                      onChange={(e) => setRepairDetails(p => ({ ...p, loyalty_apply_input: e.target.value }))}
                      className={`${inp} flex-1`}
                    />
                    <Button variant="outline" size="sm" onClick={() => {
                      const due = parseFloat(repairDetails.deposit_paid) || 0
                      const pts = Math.min(parseInt(repairDetails.loyalty_apply_input) || 0, loyaltyBalance ?? 0)
                      const capped = Math.min(pts * loyaltyRate, due)
                      setRepairDetails(p => ({ ...p, loyalty_apply_input: String(Math.round(capped / loyaltyRate)) }))
                    }}>Apply</Button>
                  </div>
                </div>
              )}

              {repairDetails.payment_methods.length > 0 && (() => {
                const splits = buildPaymentSplits(repairDetails.payment_methods, repairDetails.payment_amounts, repairDetails.credit_apply_input, repairDetails.loyalty_apply_input, loyaltyRate)
                const applied = paymentSplitTotal(splits)
                const due = parseFloat(repairDetails.deposit_paid) || 0
                const remaining = due - applied
                return (
                  <p className={`mt-2 text-xs font-medium ${Math.abs(remaining) < 0.01 ? 'text-green-600' : 'text-amber-600'}`}>
                    Applied {formatCurrency(applied)} / {formatCurrency(due)} {Math.abs(remaining) >= 0.01 && `· Remaining ${formatCurrency(remaining)}`}
                  </p>
                )
              })()}
            </div>
          </div>

          {/* DEVICE LOCK */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-brand-teal">
              <Lock className="h-3 w-3" /> Device Lock
            </p>
            <div className="mb-2 flex items-center gap-2">
              {(['', 'passcode', 'pattern'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setRepairDetails(p => ({ ...p, lock_type: t, passcode: '' }))}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${repairDetails.lock_type === t ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {t === '' ? 'None' : t}
                </button>
              ))}
            </div>
            {repairDetails.lock_type === 'passcode' && (
              <div className="max-w-[200px]">
                <label className={lbl}>Passcode / PIN</label>
                <input
                  type="text" value={repairDetails.passcode}
                  onChange={(e) => setRepairDetails(d => ({ ...d, passcode: e.target.value }))}
                  placeholder="Enter passcode…"
                  className={inp}
                />
              </div>
            )}
            {repairDetails.lock_type === 'pattern' && (
              <div className="flex flex-col items-start gap-1">
                <label className={lbl}>Draw Pattern</label>
                <PatternLock
                  value={repairDetails.passcode}
                  onChange={(v) => setRepairDetails(d => ({ ...d, passcode: v }))}
                  size={180}
                />
                {repairDetails.passcode && (
                  <button type="button" onClick={() => setRepairDetails(d => ({ ...d, passcode: '' }))} className="mt-1 text-xs text-gray-400 hover:text-red-500 transition-colors">
                    Clear pattern
                  </button>
                )}
              </div>
            )}
          </div>

          {/* POS EXTRAS */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-brand-teal">
              <StickyNote className="h-3 w-3" /> Additional Details
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={lbl}>Device Physical Location</label>
                <input
                  type="text" placeholder="Select Physical Location"
                  value={repairDetails.physical_location}
                  onChange={(e) => setRepairDetails(d => ({ ...d, physical_location: e.target.value }))}
                  className={inp}
                />
              </div>
              <div>
                <label className={lbl}>Repair Task Type</label>
                <select value={repairDetails.task_type} onChange={(e) => setRepairDetails(d => ({ ...d, task_type: e.target.value }))} className={sel}>
                  {TASK_TYPE_OPTIONS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Device Network</label>
                <input
                  type="text" placeholder="Select Network"
                  value={repairDetails.device_network}
                  onChange={(e) => setRepairDetails(d => ({ ...d, device_network: e.target.value }))}
                  className={inp}
                />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="checkbox" id="rush_job"
                checked={repairDetails.is_rush}
                onChange={(e) => setRepairDetails(d => ({ ...d, is_rush: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-brand-teal"
              />
              <label htmlFor="rush_job" className="text-sm font-medium text-gray-700">Mark as Rush Job</label>
            </div>
          </div>

          {/* Custom Fields */}
          {repairCustomFieldDefs.length > 0 && (
            <div className="rounded-xl border border-brand-teal-light bg-brand-teal-light p-4">
              <p className="mb-2 text-xs font-semibold text-brand-teal-dark">Additional Fields</p>
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

      {/* Repair Job Created Success Overlay */}
      {success && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-2xl bg-white px-16 py-14 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-9 w-9 text-green-600" />
            </div>
            <p className="text-xl font-bold text-green-700">Repair Job Created!</p>
            <p className="mt-1 text-sm text-gray-500">Invoice has been sent to print.</p>
          </div>
        </div>
      )}
    </div>
  )
}
