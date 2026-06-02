'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Plus, Search, LayoutGrid, List, Wrench, DollarSign, AlertTriangle, Clock, TrendingUp, CheckCircle, ChevronLeft, Smartphone, StickyNote, Eye, Pencil, Trash2, FileText, Receipt, ChevronDown, FileDown, FileSpreadsheet, Printer, Columns, Lock, X, Mail, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/shared/data-table'
import { AsyncEmployeeSelect } from '@/components/shared/async-employee-select'
import { Modal } from '@/components/ui/modal'
import { KanbanBoard } from '@/components/repairs/kanban-board'
import { CreatableCombobox } from '@/components/ui/creatable-combobox'
import { useAuthStore } from '@/store/auth.store'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { formatCurrency, formatDateTime, formatDate, formatStatus } from '@/lib/utils'
import { Select } from '@/components/ui/select'
import type { ColumnDef, VisibilityState } from '@tanstack/react-table'
import type { Repair } from '@/types/database'
import type { InvoiceSettings } from '@/types/invoice-settings'
import { RepairEmailPrompt } from '@/components/repairs/email-prompt-modal'
import { RepairSlipModal } from '@/components/repairs/slip-modal'
import { toast } from 'sonner'
import { RepairInvoiceModal } from '@/components/repairs/invoice-modal'
import { ConfirmModal } from '@/components/ui/confirm-modal'
import { PatternLock } from '@/components/ui/pattern-lock'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'

interface SelectedCustomer {
  id: string
  first_name: string
  last_name: string | null
  phone: string | null
  email: string | null
  business_name?: string | null
  address?: string | null
}

interface RepairRow extends Repair {
  customers?: { first_name: string; last_name: string | null; phone: string | null; email: string | null } | null
  is_rush?: boolean
}

interface RepairCustomStatus { id: string; name: string; color: string; sort_order: number; created_at: string; business_id: string }
interface RepairFault        { id: string; name: string; sort_order: number; created_at: string; business_id: string }
interface RepairMeta {
  customStatuses: RepairCustomStatus[]
  faults:         RepairFault[]
}
interface RepairListResponse {
  data: RepairRow[]
  meta: { total: number; page: number; limit: number }
}

const EMPTY_NEW_CUST = { first_name: '', last_name: '', business_name: '', email: '', phone: '', address: '' }
const EMPTY_JOB = {
  device_name: '', device_type: '', device_brand: '', device_model: '',
  imei: '', faults: [] as string[],
  job_fee: '', estimated_cost: '', deposit_paid: '',
  due_date: '', customer_note: '', staff_note: '',
  status: '', assigned_to: '',
  lock_type: '' as '' | 'passcode' | 'pattern',
  passcode: '',
  price_pending: false,
}

function ActionsMenu({ onEdit, onSlip, onInvoice, onDelete, onMessage }: {
  onEdit: () => void
  onSlip: () => void
  onInvoice: () => void
  onDelete: () => void
  onMessage: () => void
}) {
  const item = 'flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none transition-colors'

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors focus:outline-none"
        >
          Actions <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 w-40 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden p-0 animate-in fade-in zoom-in-95 duration-100"
          sideOffset={5}
          align="end"
        >
          <DropdownMenu.Item className={item} onSelect={onEdit}>
            <Pencil className="h-3.5 w-3.5 text-blue-500" /> Edit
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={onSlip}>
            <Receipt className="h-3.5 w-3.5 text-teal-500" /> Slip
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={onInvoice}>
            <FileText className="h-3.5 w-3.5 text-violet-500" /> Invoice
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={onMessage}>
            <Mail className="h-3.5 w-3.5 text-blue-500" /> Message
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="h-px bg-gray-100" />
          <DropdownMenu.Item className={`${item} text-red-600 hover:bg-red-50`} onSelect={onDelete}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

type DeviceData = {
  types: string[]
  brands: string[]
  models: string[]
  raw: { device_type: string | null; device_brand: string | null; device_model: string | null }[]
  brandIdMap: Record<string, string>
  typeIdMap:  Record<string, string>
  modelIdMap: Record<string, string>
}

interface RepairLineItem {
  tempId: string
  product_id: string | null
  name: string
  qty: number
  unit_price: number
  unit_cost: number
}

function ComboInput({ value, onChange, options, placeholder }: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const filtered = options.filter((o) => o.toLowerCase().includes(value.toLowerCase()) && o !== value)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-indigo-200 bg-white px-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filtered.map((o) => (
            <li key={o}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50"
                onMouseDown={(e) => { e.preventDefault(); onChange(o); setOpen(false) }}
              >
                <span className="text-gray-700">{o}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MultiComboInput({ values, onAdd, onRemove, options, placeholder }: {
  values: string[]
  onAdd: (v: string) => void
  onRemove: (v: string) => void
  options: string[]
  placeholder?: string
}) {
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const filtered = options.filter((o) => o.toLowerCase().includes(value.toLowerCase()) && !values.includes(o))

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
            {v}
            <button type="button" onClick={() => onRemove(v)} className="hover:text-indigo-900 transition-colors">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) {
              e.preventDefault()
              if (!values.includes(value.trim())) onAdd(value.trim())
              setValue('')
            }
          }}
          placeholder={placeholder}
          className="h-8 w-full rounded-md border border-indigo-200 bg-white px-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
        />
        {open && (value || filtered.length > 0) && (
          <ul className="absolute z-50 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {filtered.map((o) => (
              <li key={o}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors"
                  onMouseDown={(e) => { e.preventDefault(); onAdd(o); setValue(''); setOpen(false) }}
                >
                  <span className="text-gray-700">{o}</span>
                </button>
              </li>
            ))}
            {value.trim() && !options.some(o => o.toLowerCase() === value.trim().toLowerCase()) && (
              <li>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50 border-t border-gray-100 transition-colors"
                  onMouseDown={(e) => { e.preventDefault(); onAdd(value.trim()); setValue(''); setOpen(false) }}
                >
                  <span className="text-gray-500 italic">Add "{value.trim()}"...</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}

const EXPORTABLE_COLUMNS = ['Job #', 'Customer', 'Type', 'Brand', 'Model', 'Status', 'Cost', 'Created']

function exportCSV(repairs: RepairRow[]) {
  const rows = [
    EXPORTABLE_COLUMNS.join(','),
    ...repairs.map((r) => [
      r.job_number,
      `"${r.customers ? `${r.customers.first_name} ${r.customers.last_name ?? ''}`.trim() : 'N/A'}"`,
      `"${r.device_type ?? 'N/A'}"`,
      `"${r.device_brand ?? 'N/A'}"`,
      `"${r.device_model ?? 'N/A'}"`,
      r.status,
      r.actual_cost ?? r.estimated_cost ?? 0,
      r.created_at ? formatDate(r.created_at) : 'N/A'
    ].join(','))
  ]
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `repairs_export_${new Date().toISOString().split('T')[0]}.csv`
  a.click()
}

function exportExcel(repairs: RepairRow[]) {
  const rows = [
    EXPORTABLE_COLUMNS,
    ...repairs.map((r) => [
      r.job_number,
      r.customers ? `${r.customers.first_name} ${r.customers.last_name ?? ''}`.trim() : 'N/A',
      r.device_type ?? 'N/A',
      r.device_brand ?? 'N/A',
      r.device_model ?? 'N/A',
      r.status,
      r.actual_cost ?? r.estimated_cost ?? 0,
      r.created_at ? formatDate(r.created_at) : 'N/A'
    ])
  ]
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Repairs"><Table>${rows.map((r) => `<Row>${r.map((v) => `<Cell><Data ss:Type="String">${String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>`
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `repairs_export_${new Date().toISOString().split('T')[0]}.xls`
  a.click()
}

function exportPDF(repairs: RepairRow[]) {
  const html = `<html><head><title>Repairs Export</title><style>body{font-family:sans-serif;font-size:12px;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#0d7070;color:#fff}</style></head><body><h2>Repair Jobs Report</h2><p>Generated on: ${new Date().toLocaleString()}</p><table><thead><tr>${EXPORTABLE_COLUMNS.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${repairs.map(r => `<tr><td>${r.job_number}</td><td>${r.customers ? `${r.customers.first_name} ${r.customers.last_name ?? ''}`.trim() : 'N/A'}</td><td>${r.device_type ?? 'N/A'}</td><td>${r.device_brand ?? 'N/A'}</td><td>${r.device_model ?? 'N/A'}</td><td>${r.status}</td><td>$${r.actual_cost ?? r.estimated_cost ?? 0}</td><td>${r.created_at ? formatDate(r.created_at) : 'N/A'}</td></tr>`).join('')}</tbody></table></body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.print()
}

export default function RepairsPage() {
  const { activeBranch } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [statsPeriod, setStatsPeriod] = useState<'month' | '3months' | '6months' | 'year'>('month')

  // URL-based state
  const page = parseInt(searchParams.get('page') || '0', 10)
  const view = (searchParams.get('view') as 'list' | 'kanban') || 'list'

  const setPage = useCallback((newPage: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(newPage))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [searchParams, pathname, router])

  const setView = useCallback((newView: 'list' | 'kanban') => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('view', newView)
    params.set('page', '0')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [searchParams, pathname, router])
  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalStep, setModalStep] = useState<1 | 2>(1)
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null)
  const [newCust, setNewCust] = useState(EMPTY_NEW_CUST)
  const [phoneError, setPhoneError] = useState('')
  const [jobData, setJobData] = useState(EMPTY_JOB)
  const [submitting, setSubmitting] = useState(false)
  const [step1Error, setStep1Error] = useState('')
  const [chargesError, setChargesError] = useState('')
  // Customer autocomplete
  const [custSuggestions, setCustSuggestions] = useState<SelectedCustomer[]>([])
  const [showSuggestions, setShowSuggestions] = useState<'name' | 'phone' | 'email' | null>(null)
  const [custSearchLoading, setCustSearchLoading] = useState(false)
  const custSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recentCustCache = useRef<SelectedCustomer[]>([])

  // Repair parts state
  const [repairParts, setRepairParts] = useState<RepairLineItem[]>([])
  const [partQuery, setPartQuery] = useState('')
  const [partResults, setPartResults] = useState<Array<{ id: string; name: string; selling_price: number | null; cost_price: number | null }>>([])
  const [showPartDrop, setShowPartDrop] = useState(false)
  const [partSearchLoading, setPartSearchLoading] = useState(false)
  const partSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const partDropRef = useRef<HTMLDivElement>(null)
  const [quickPartPrice, setQuickPartPrice] = useState('')
  const [quickPartCost, setQuickPartCost] = useState('')
  const [deviceError, setDeviceError] = useState('')

  const [emailPrompt, setEmailPrompt] = useState<{ repairId: string; jobNumber: string; currentStatus: string } | null>(null)
  const [slipRepair, setSlipRepair] = useState<RepairRow | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string, jobNumber: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [colVisibility, setColVisibility] = useState<VisibilityState>({})
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const colMenuRef = useRef<HTMLDivElement>(null)

  // Edit Job Sheet modal
  const [editOpen, setEditOpen] = useState(false)
  const [editRepair, setEditRepair] = useState<RepairRow | null>(null)
  const [editData, setEditData] = useState({ due_date: '', estimated_cost: '', deposit_paid: '', payment_method: '' as '' | 'cash' | 'card', status: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editErrors, setEditErrors] = useState<{ due_date?: string; estimated_cost?: string; deposit_paid?: string }>({})

  // Declare before the lazy queries that use them as enabled guards
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false)

  const [selectedInvoiceRepair, setSelectedInvoiceRepair] = useState<RepairRow | null>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setColMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (partDropRef.current && !partDropRef.current.contains(e.target as Node)) {
        setShowPartDrop(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const queryClient = useQueryClient()
  const repairsQueryKey     = ['repairs', activeBranch?.id, page, search, statusFilter, view] as const
  const repairsBaseKey      = ['repairs', activeBranch?.id] as const

  // ── Repairs Query — fires immediately, table shows as soon as this returns ──
  const { data: repairResponse, isLoading: repairsLoading, isFetching: repairsFetching, refetch: fetchRepairs } = useQuery<RepairListResponse>({
    queryKey: repairsQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        branch_id: activeBranch!.id,
        page: String(view === 'kanban' ? 1 : page + 1),
        limit: view === 'kanban' ? '200' : '20',
      })
      if (search) params.set('search', search)
      if (statusFilter && view === 'list') params.set('status', statusFilter)

      const res = await fetch(`/api/repairs?${params}`)
      if (!res.ok) throw new Error('Failed to fetch repairs')
      return res.json()
    },
    enabled: !!activeBranch,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })

  const repairs = repairResponse?.data ?? []
  const total = repairResponse?.meta?.total ?? 0
  const [loading, setLoading] = useState(false)

  // Use local loading only for actions, use repairsLoading for initial data
  useEffect(() => { setLoading(repairsLoading) }, [repairsLoading])

  // ── Single meta call: custom-statuses + faults ─────────────────────────────
  // Fires in parallel with repairs — staleTime: Infinity means it's fetched
  // once per session and never refetched unless explicitly invalidated.
  const { data: metaData } = useQuery<RepairMeta>({
    queryKey: ['repairs-meta', activeBranch?.id],
    queryFn: async () => {
      const res = await fetch(`/api/repairs/meta?branch_id=${activeBranch!.id}`)
      const json = await res.json()
      return json.data || { customStatuses: [], faults: [] }
    },
    enabled: !!activeBranch,
    staleTime: Infinity,
  })
  const customStatuses = metaData?.customStatuses ?? []
  const faults         = metaData?.faults         ?? []

  // ── Device catalogue — fires in parallel; staleTime:Infinity so fetched once ──
  const { data: deviceData = { types: [], brands: [], models: [], raw: [], brandIdMap: {}, typeIdMap: {}, modelIdMap: {} } } = useQuery<DeviceData>({
    queryKey: ['device-data', activeBranch?.id],
    queryFn: async () => {
      const res = await fetch(`/api/repairs/devices?branch_id=${activeBranch!.id}`)
      const json = await res.json()
      return json.data || { types: [], brands: [], models: [], raw: [], brandIdMap: {}, typeIdMap: {}, modelIdMap: {} }
    },
    enabled: !!activeBranch,
    staleTime: Infinity,
  })

  // ── Repair stats — fires in parallel with repairs ─────────────────────────
  const { data: repairStats = null } = useQuery({
    queryKey: ['repairs-stats', activeBranch?.id, statsPeriod],
    queryFn: async () => {
      const res = await fetch(`/api/repairs/stats?branch_id=${activeBranch!.id}&period=${statsPeriod}`)
      const json = await res.json()
      return json.data ?? null
    },
    enabled: !!activeBranch,
    staleTime: 60 * 1000,
    select: (d: any) => {
      if (!d) return null
      return {
        total_repairs:     d.repairs_total,
        repairs_open:      d.repairs_open,
        repairs_completed: d.repairs_completed,
        repairs_urgent:    d.repairs_urgent,
        total_sales:       d.repairs_revenue ?? 0,
        repairs_profit:    d.repairs_profit  ?? 0,
      }
    },
  })

  // ── Invoice settings — lazy: only fetched when the invoice modal opens ──
  const { data: invoiceSettings } = useQuery<InvoiceSettings | null>({
    queryKey: ['invoice-settings', activeBranch?.id],
    queryFn: async () => {
      const res = await fetch(`/api/settings/invoice?branch_id=${activeBranch!.id}`)
      const json = await res.json()
      return (json.data as InvoiceSettings) ?? null
    },
    enabled: !!activeBranch && invoiceModalOpen,
    staleTime: 0,
  })

  function invalidateStats() {
    queryClient.invalidateQueries({ queryKey: ['repairs-stats', activeBranch?.id, statsPeriod], exact: true })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  // Auto-populate total charges = job fee + parts retail total
  useEffect(() => {
    setJobData((prev) => {
      const partsTotal = repairParts.reduce((s, p) => s + p.unit_price * p.qty, 0)
      const fee = parseFloat(prev.job_fee) || 0
      return { ...prev, estimated_cost: (fee + partsTotal).toFixed(2) }
    })
  }, [repairParts])

  function deleteRepair(repairId: string, jobNumber: string) {
    setConfirmDelete({ id: repairId, jobNumber })
  }

  function handleOpenInvoice(r: RepairRow) {
    setSelectedInvoiceRepair(r)
    setInvoiceModalOpen(true)
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    setIsDeleting(true)
    const res = await fetch(`/api/repairs/${confirmDelete.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success(`Repair ${confirmDelete.jobNumber} deleted.`)
      queryClient.invalidateQueries({ queryKey: repairsBaseKey })
      invalidateStats()
      setConfirmDelete(null)
    } else {
      if (res.status === 403) {
        toast.error("Permission Denied: You don't have permission to delete repair jobs.")
      } else {
        toast.error('Failed to delete repair. Please try again.')
      }
    }
    setIsDeleting(false)
  }

  async function handleStatusChange(repairId: string, newStatus: string) {
    const previousData  = queryClient.getQueryData<RepairListResponse>(repairsQueryKey)
    const previousStats = queryClient.getQueryData<any>(['repairs-stats', activeBranch?.id, statsPeriod])
    const repair        = previousData?.data?.find((r: RepairRow) => r.id === repairId)
    const oldStatus     = (repair?.status ?? '').toLowerCase()
    const newStatusLo   = newStatus.toLowerCase()

    const TERM_EXACT = new Set(['repaired', 'collected', 'unrepairable'])
    const TERM_KW    = ['complet', 'done', 'fixed', 'pick', 'closed', 'resolv', 'finish', 'collect', 'handover']
    const isTerm = (s: string) => TERM_EXACT.has(s) || TERM_KW.some(kw => s.includes(kw))

    // Optimistic: status badge flips instantly.
    queryClient.setQueryData<RepairListResponse>(repairsQueryKey, (old) => {
      if (!old?.data) return old
      return { ...old, data: old.data.map((r: RepairRow) => r.id === repairId ? { ...r, status: newStatus } : r) }
    })

    // Optimistic: revenue and counts flip instantly (profit waits for real refetch — needs parts data).
    if (repair && previousStats) {
      const deposit  = (repair as any).deposit_paid  ?? 0
      const fullCost = (repair as any).actual_cost   ?? (repair as any).estimated_cost ?? 0
      const refund   = (repair as any).refund_amount ?? 0
      const calcRev  = (s: string) => isTerm(s) ? fullCost : s === 'refunded' ? Math.max(0, deposit - refund) : deposit
      const revDelta = calcRev(newStatusLo) - calcRev(oldStatus)
      const wasOpen  = !isTerm(oldStatus)  && oldStatus  !== 'refunded'
      const isNowOpen = !isTerm(newStatusLo) && newStatusLo !== 'refunded'
      queryClient.setQueryData(['repairs-stats', activeBranch?.id, statsPeriod], (old: any) => ({
        ...old,
        repairs_revenue:   (old.repairs_revenue  ?? 0) + revDelta,
        repairs_completed: (old.repairs_completed ?? 0) + (isTerm(newStatusLo) ? 1 : 0) - (isTerm(oldStatus) ? 1 : 0),
        repairs_open:      (old.repairs_open      ?? 0) + (isNowOpen ? 1 : 0) - (wasOpen ? 1 : 0),
      }))
    }

    const res = await fetch(`/api/repairs/${repairId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, note: '', send_email: false }),
    })

    if (!res.ok) {
      if (previousData)  queryClient.setQueryData(repairsQueryKey, previousData)
      if (previousStats) queryClient.setQueryData(['repairs-stats', activeBranch?.id, statsPeriod], previousStats)
      queryClient.invalidateQueries({ queryKey: repairsBaseKey })
      if (res.status === 403) {
        toast.error("Permission Denied: You don't have permission to update repair status.")
      } else {
        toast.error('Failed to update status.')
      }
    } else {
      // Invalidate the other view's cache (kanban ↔ list) so switching views shows updated data
      queryClient.invalidateQueries({ queryKey: repairsBaseKey })
      invalidateStats()
      toast.success('Status updated · Customer notified by email', {
        icon: '✉️',
        duration: 3500,
      })
    }
  }

  // Fetch supporting data replaced by React Query above

  function openEdit(r: RepairRow) {
    setEditRepair(r)
    const cf = (r.custom_fields as any) ?? {}
    setEditData({
      due_date: cf.due_date ?? '',
      estimated_cost: r.estimated_cost != null ? String(r.estimated_cost) : '',
      deposit_paid: r.deposit_paid != null ? String(r.deposit_paid) : '',
      payment_method: (cf.payment_method as '' | 'cash' | 'card') ?? '',
      status: r.status ?? '',
    })
    setEditErrors({})
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!editRepair) return
    // Validate required fields
    const errs: { due_date?: string; estimated_cost?: string; deposit_paid?: string } = {}
    if (!editData.due_date) errs.due_date = 'Due date is required.'
    else if (editData.due_date < new Date().toISOString().split('T')[0]) errs.due_date = 'Due date cannot be in the past.'
    const costVal = parseFloat(editData.estimated_cost)
    if (editData.estimated_cost.trim() === '' || isNaN(costVal) || costVal < 0)
      errs.estimated_cost = 'Total Repair Charges is required and must be a valid amount.'
    const depositVal = parseFloat(editData.deposit_paid)
    if (editData.deposit_paid.trim() === '' || isNaN(depositVal) || depositVal < 0)
      errs.deposit_paid = 'Deposit is required and must be a valid amount.'
    if (Object.keys(errs).length > 0) { setEditErrors(errs); return }
    setEditErrors({})
    setEditSaving(true)
    try {
      const cf = (editRepair.custom_fields as any) ?? {}
      const res = await fetch(`/api/repairs/${editRepair.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estimated_cost: editData.estimated_cost === '' ? null : parseFloat(editData.estimated_cost),
          deposit_paid: editData.deposit_paid === '' ? 0 : parseFloat(editData.deposit_paid),
          status: editData.status || undefined,
          custom_fields: { 
            ...cf, 
            due_date: editData.due_date || null, 
            payment_method: editData.payment_method || null 
          },
        }),
      })
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'Failed to update repair')
      }

      toast.success('Repair job updated successfully.')
      setEditOpen(false)
      fetchRepairs()
      invalidateStats()
    } catch (err: any) {
      console.error('Save edit error:', err)
      toast.error(err.message || 'An error occurred while saving.')
    } finally {
      setEditSaving(false)
    }
  }

  function openModal() {
    setModalStep(1)
    setSelectedCustomer(null)
    setNewCust(EMPTY_NEW_CUST)
    setJobData(EMPTY_JOB)
    setStep1Error('')
    setPhoneError('')
    setChargesError('')
    setDeviceError('')
    setCustSuggestions([])
    setShowSuggestions(null)
    setRepairParts([])
    setPartQuery('')
    setPartResults([])
    setShowPartDrop(false)
    setQuickPartPrice('')
    setQuickPartCost('')
    setModalOpen(true)
    // Pre-fetch recent customers so the dropdown is instant on focus
    if (recentCustCache.current.length === 0) {
      fetch('/api/customers?limit=6&sort=created_at')
        .then((r) => r.json())
        .then((j) => { recentCustCache.current = j.data ?? [] })
        .catch(() => {})
    }
  }

  // Open modal if ?new=true is in the URL
  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      openModal()
      const newParams = new URLSearchParams(searchParams.toString())
      newParams.delete('new')
      router.replace(`${pathname}?${newParams.toString()}`)
    }
  }, [searchParams, pathname, router])

  /** Allow digits, +, spaces, hyphens, parentheses — min 6 digits, max 15 digits (E.164 standard) */
  function validatePhone(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) return 'Phone number is required.'
    if (/[a-zA-Z]/.test(trimmed)) return 'Phone number must not contain letters.'
    const digits = trimmed.replace(/\D/g, '')
    if (digits.length < 6) return 'Phone number is too short (minimum 6 digits).'
    if (digits.length > 15) return 'Phone number is too long (maximum 15 digits).'
    if (!/^[+\d][\d\s\-().]*$/.test(trimmed)) return 'Phone number contains invalid characters.'
    return ''
  }

  async function goToStep2() {
    setStep1Error('')
    setShowSuggestions(null)
    if (selectedCustomer) { setModalStep(2); return }
    if (!newCust.first_name.trim()) { setStep1Error('Customer name is required.'); return }
    const pErr = validatePhone(newCust.phone)
    if (pErr) { setPhoneError(pErr); return }
    setPhoneError('')
    setModalStep(2)
  }

  function triggerCustSearch(q: string, field: 'name' | 'phone' | 'email') {
    if (custSearchRef.current) clearTimeout(custSearchRef.current)
    if (!q.trim() || q.length < 2) { setCustSuggestions([]); setShowSuggestions(null); return }
    setCustSearchLoading(true)
    custSearchRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers?search=${encodeURIComponent(q)}&limit=5`)
        const json = await res.json()
        const data = (json.data ?? []) as SelectedCustomer[]
        setCustSuggestions(data)
        setShowSuggestions(data.length > 0 ? field : null)
      } finally {
        setCustSearchLoading(false)
      }
    }, 250)
  }

  function fetchRecentCustomers(field: 'name' | 'phone' | 'email') {
    if (selectedCustomer) return
    // Show cached results instantly
    if (recentCustCache.current.length > 0) {
      setCustSuggestions(recentCustCache.current)
      setShowSuggestions(field)
      return
    }
    // First time — fetch and cache
    fetch('/api/customers?limit=6&sort=created_at')
      .then((r) => r.json())
      .then((j) => {
        const data = (j.data ?? []) as SelectedCustomer[]
        recentCustCache.current = data
        if (data.length > 0) { setCustSuggestions(data); setShowSuggestions(field) }
      })
      .catch(() => {})
  }

  function searchParts(q: string) {
    if (partSearchRef.current) clearTimeout(partSearchRef.current)
    if (!q.trim()) { setPartResults([]); setShowPartDrop(false); return }
    setPartSearchLoading(true)
    partSearchRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ item_type: 'part', branch_id: activeBranch!.id, search: q, limit: '8' })
        const res = await fetch(`/api/products?${params}`)
        const json = await res.json()
        setPartResults(json.data ?? [])
        setShowPartDrop(true)
      } finally {
        setPartSearchLoading(false)
      }
    }, 300)
  }

  function addPartFromInventory(p: { id: string; name: string; selling_price: number | null; cost_price: number | null }) {
    setRepairParts((prev) => {
      const existing = prev.find((r) => r.product_id === p.id)
      if (existing) return prev.map((r) => r.product_id === p.id ? { ...r, qty: r.qty + 1 } : r)
      return [...prev, {
        tempId: Math.random().toString(36).slice(2),
        product_id: p.id,
        name: p.name,
        qty: 1,
        unit_price: p.selling_price ?? 0,
        unit_cost: p.cost_price ?? 0,
      }]
    })
    setPartQuery('')
    setPartResults([])
    setShowPartDrop(false)
  }

  function addQuickPart() {
    const name = partQuery.trim()
    const price = parseFloat(quickPartPrice) || 0
    const cost  = parseFloat(quickPartCost)  || 0
    if (!name) return
    setRepairParts((prev) => [...prev, {
      tempId: Math.random().toString(36).slice(2),
      product_id: null,
      name,
      qty: 1,
      unit_price: price,
      unit_cost: cost,
    }])
    setPartQuery('')
    setQuickPartPrice('')
    setQuickPartCost('')
    setShowPartDrop(false)
  }

  function handleCustSuggestionSelect(c: SelectedCustomer) {
    setSelectedCustomer(c)
    setNewCust({
      first_name: [c.first_name, c.last_name].filter(Boolean).join(' '),
      last_name: '',
      business_name: c.business_name ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      address: c.address ?? '',
    })
    setCustSuggestions([])
    setShowSuggestions(null)
    setStep1Error('')
    setPhoneError('')
  }

  async function createRepair() {
    if (!activeBranch) return
    // Device selection required
    if (!jobData.device_type || !jobData.device_brand || !jobData.device_model) {
      setDeviceError('Device Type, Brand and Model are all required.')
      return
    }
    setDeviceError('')
    if (jobData.faults.length === 0) return
    if (!jobData.price_pending) {
      const totalVal = parseFloat(jobData.estimated_cost)
      if (!jobData.estimated_cost.trim() || isNaN(totalVal) || totalVal < 0) {
        setChargesError('Total Charges is required and must be a valid amount.')
        return
      }
    }
    setChargesError('')
    setSubmitting(true)

    let customerId = selectedCustomer?.id ?? null

    // Create new customer if no existing customer was selected
    if (!customerId) {
      const custRes = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: newCust.first_name.trim(),
          last_name: newCust.last_name.trim() || null,
          business_name: newCust.business_name.trim() || null,
          email: newCust.email.trim() || null,
          phone: newCust.phone.trim() || null,
          address: newCust.address.trim() || null,
          branch_id: activeBranch.id,
        }),
      })
      const custJson = await custRes.json()
      if (!custRes.ok || !custJson.data?.id) {
        const errMsg = typeof custJson.error === 'string' ? custJson.error : (custJson.error?.message ?? 'Failed to create customer. Please try again.')
        toast.error(errMsg)
        setSubmitting(false)
        return
      }
      customerId = custJson.data.id
    }

    const total = parseFloat(jobData.estimated_cost) || 0
    const deposit = parseFloat(jobData.deposit_paid) || 0
    const faultText = jobData.faults.join(', ')

    const res = await fetch('/api/repairs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: activeBranch.id,
        customer_id: customerId,
        issue: faultText,
        device_type: jobData.device_type || null,
        device_brand: jobData.device_brand || null,
        device_model: jobData.device_model || jobData.device_name || null,
        serial_number: jobData.imei || null,
        estimated_cost: total || null,
        deposit_paid: deposit,
        assigned_to: jobData.assigned_to || null,
        status: jobData.status || undefined,
        lock_type: jobData.lock_type || null,
        passcode: jobData.passcode.trim() || null,
        custom_fields: {
          imei: jobData.imei || null,
          due_date: jobData.due_date || null,
          customer_note: jobData.customer_note || null,
          staff_note: jobData.staff_note || null,
          price_pending: jobData.price_pending || undefined,
        },
        parts: repairParts.map((p) => ({
          product_id: p.product_id,
          name: p.name,
          quantity: p.qty,
          unit_cost: p.unit_cost,
          unit_price: p.unit_price,
        })),
      }),
    })

    if (res.ok) {
      setModalOpen(false)
      fetchRepairs()
      invalidateStats()
      toast.success('Repair job created.')
    } else {
      const j = await res.json().catch(() => ({}))
      const errMsg = typeof j.error === 'string' ? j.error : (j.error?.message ?? 'Failed to create repair. Please try again.')
      toast.error(errMsg)
    }
    setSubmitting(false)
  }

  // ── Inline Creators for Device Catalogue (Optimistic / Fire-and-forget) ──
  async function createDeviceType(name: string) {
    if (!activeBranch) return
    setJobData((p) => ({ ...p, device_type: name, device_brand: '', device_model: '' }))
    // Optimistically add to types list (id unknown until API responds)
    queryClient.setQueryData<DeviceData>(['device-data', activeBranch.id], (old) => {
      if (!old || old.types.includes(name)) return old
      return { ...old, types: [...old.types, name] }
    })
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    try {
      const res = await fetch('/api/services/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, display_order: 0, show_on_pos: true, retail_margin: 0 }),
      })
      if (res.ok) {
        const json = await res.json()
        const newId = json.data?.id
        if (newId) {
          // Persist the real DB id into typeIdMap so brand creation can link to it
          queryClient.setQueryData<DeviceData>(['device-data', activeBranch.id], (old) => {
            if (!old) return old
            return { ...old, typeIdMap: { ...old.typeIdMap, [name]: newId } }
          })
        } else {
          queryClient.invalidateQueries({ queryKey: ['device-data'] })
        }
      }
    } catch { /* fire-and-forget */ }
  }

  async function createDeviceBrand(name: string) {
    if (!activeBranch) return
    // Capture current type before any async gap
    const deviceType = jobData.device_type
    setJobData((p) => ({ ...p, device_brand: name, device_model: '' }))
    // Optimistically add brand + raw type→brand association
    queryClient.setQueryData<DeviceData>(['device-data', activeBranch.id], (old) => {
      if (!old || old.brands.includes(name)) return old
      const newRaw = deviceType
        ? [...old.raw, { device_type: deviceType, device_brand: name, device_model: null }]
        : old.raw
      return { ...old, brands: [...old.brands, name], raw: newRaw }
    })
    const categoryId = deviceType ? (deviceData.typeIdMap ?? {})[deviceType] : undefined
    try {
      const res = await fetch('/api/services/manufacturers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ...(categoryId ? { category_id: categoryId } : {}) }),
      })
      if (res.ok) {
        const json = await res.json()
        const newId = json.data?.id
        if (newId) {
          // Persist the real DB id into brandIdMap so model creation can link to it
          queryClient.setQueryData<DeviceData>(['device-data', activeBranch.id], (old) => {
            if (!old) return old
            return { ...old, brandIdMap: { ...old.brandIdMap, [name]: newId } }
          })
        } else {
          queryClient.invalidateQueries({ queryKey: ['device-data'] })
        }
      }
    } catch { /* fire-and-forget */ }
  }

  function createDeviceModel(name: string) {
    if (!activeBranch) return
    const deviceBrand = jobData.device_brand
    const deviceType  = jobData.device_type
    setJobData((p) => ({ ...p, device_model: name }))
    // Optimistically add model + raw brand→model association
    queryClient.setQueryData<DeviceData>(['device-data', activeBranch.id], (old) => {
      if (!old || old.models.includes(name)) return old
      const newRaw = [...old.raw, { device_type: deviceType || null, device_brand: deviceBrand || null, device_model: name }]
      return { ...old, models: [...old.models, name], raw: newRaw }
    })
    if (deviceBrand) {
      const manufacturerId = (deviceData.brandIdMap ?? {})[deviceBrand]
      const categoryId     = deviceType ? (deviceData.typeIdMap ?? {})[deviceType] : undefined
      if (manufacturerId) {
        fetch('/api/services/devices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            manufacturer_id: manufacturerId,
            ...(categoryId ? { category_id: categoryId } : {}),
          }),
        }).then(res => {
          if (res.ok) queryClient.invalidateQueries({ queryKey: ['device-data'] })
        }).catch(() => {})
      }
    }
  }

  // All statuses come from DB — no hardcoded fallbacks
  const allStatusOptions = customStatuses.map((cs) => ({ value: cs.name, label: formatStatus(cs.name), color: cs.color }))

  // Map status name → color for badge rendering (case-insensitive)
  const statusColorMap = Object.fromEntries(customStatuses.map((cs) => [cs.name.toLowerCase(), cs.color]))

  const columns: ColumnDef<RepairRow>[] = [
    {
      accessorKey: 'job_number', header: 'Job #', cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-blue-600">{row.original.job_number}</span>
          {row.original.is_rush && <span className="flex h-4 items-center rounded bg-orange-100 px-1.5 text-[9px] font-bold text-orange-700 uppercase tracking-widest border border-orange-200" title="Rush Job">Rush</span>}
        </div>
      )
    },
    {
      accessorKey: 'customers', header: 'Customer', cell: ({ getValue }) => {
        const c = getValue() as RepairRow['customers']
        return c ? `${c.first_name} ${c.last_name ?? ''}` : '—'
      }
    },
    {
      id: 'customer_phone', header: 'Phone', cell: ({ row }) => {
        const c = row.original.customers
        return c?.phone ? (
          <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} className="text-xs text-blue-600 hover:underline whitespace-nowrap">{c.phone}</a>
        ) : '—'
      }
    },
    {
      id: 'customer_email', header: 'Email', cell: ({ row }) => {
        const c = row.original.customers
        return c?.email ? (
          <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()} className="text-xs text-blue-600 hover:underline max-w-[160px] truncate block">{c.email}</a>
        ) : '—'
      }
    },
    {
      accessorKey: 'device_type', header: 'Type', cell: ({ getValue }) => (getValue() as string) || '—'
    },
    {
      accessorKey: 'device_brand', header: 'Brand', cell: ({ getValue }) => (getValue() as string) || '—'
    },
    {
      accessorKey: 'device_model', header: 'Model', cell: ({ getValue }) => (getValue() as string) || '—'
    },
    {
      accessorKey: 'issue', header: 'Fault', size: 180,
      cell: ({ getValue }) => {
        const v = getValue() as string
        if (!v || v.toLowerCase() === 'not specified') return <span className="text-gray-400">—</span>
        return (
          <span className="inline-block max-w-[170px] rounded-lg bg-violet-100 px-2.5 py-1 text-xs font-semibold leading-snug text-violet-800 break-words whitespace-normal">
            {v}
          </span>
        )
      }
    },
    {
      accessorKey: 'status', header: 'Status', size: 140, cell: ({ getValue, row }) => {
        const s = getValue() as string
        const customColor = statusColorMap[s.toLowerCase()]
        return (
          <div className="relative group inline-block">
            <select
              value={s}
              onChange={(e) => {
                e.stopPropagation()
                handleStatusChange(row.original.id, e.target.value)
              }}
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            >
              {allStatusOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span
              className="inline-flex cursor-pointer items-center whitespace-nowrap rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm transition-all group-hover:ring-2 group-hover:ring-offset-2 group-hover:ring-blue-400"
              style={{ backgroundColor: customColor ?? '#64748b' }}
            >
              {formatStatus(s)}
              <ChevronDown className="ml-1.5 h-3 w-3 opacity-80" />
            </span>
          </div>
        )
      }
    },
    {
      id: 'due_date', header: 'Due Date', size: 120, cell: ({ row }) => {
        const cf = (row.original.custom_fields as any) ?? {}
        if (!cf.due_date) return '—'
        const d = new Date(cf.due_date)
        return (
          <div className="text-[11px] leading-tight">
            <div className="font-semibold text-gray-900">
              {d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
            </div>
            <div className="text-gray-500">{d.getFullYear()}</div>
          </div>
        )
      }
    },
    {
      accessorKey: 'actual_cost', header: 'Cost', cell: ({ getValue, row }) => {
        const v = getValue() as number | null
        return v ? formatCurrency(v) : row.original.estimated_cost ? `~${formatCurrency(row.original.estimated_cost)}` : '—'
      }
    },
    { 
      accessorKey: 'created_at', header: 'Created', size: 110, cell: ({ getValue }) => {
        const d = new Date(getValue() as string)
        return (
          <div className="text-[11px] leading-tight">
            <div className="font-semibold text-gray-900 whitespace-nowrap">
              {d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
            <div className="text-gray-500">
              {d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        )
      }
    },
    {
      id: 'actions', header: 'Action', size: 160,
      cell: ({ row }) => {
        const r = row.original
        return (
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => router.push(`/repairs/${r.id}`)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 py-1.5 text-xs font-bold text-cyan-700 hover:bg-cyan-100 transition-all shadow-sm active:scale-95"
            >
              <Eye className="h-3.5 w-3.5" /> DETAILS
            </button>
            <ActionsMenu
              onEdit={() => openEdit(r)}
              onSlip={() => setSlipRepair(r)}
              onInvoice={() => handleOpenInvoice(r)}
              onDelete={() => deleteRepair(r.id, r.job_number)}
              onMessage={() => setEmailPrompt({ repairId: r.id, jobNumber: r.job_number, currentStatus: r.status ?? 'received' })}
            />
          </div>
        )
      }
    },
  ]

  const TOGGLEABLE_COLS = ['customers', 'customer_phone', 'customer_email', 'device_type', 'device_brand', 'device_model', 'issue', 'status', 'actual_cost', 'created_at']
  const COL_LABELS: Record<string, string> = {
    customers: 'Customer',
    customer_phone: 'Phone',
    customer_email: 'Email',
    device_type: 'Type',
    device_brand: 'Brand',
    device_model: 'Model',
    issue: 'Fault',
    status: 'Status',
    actual_cost: 'Cost',
    created_at: 'Created',
  }
  // Hide phone/email by default — user can toggle on from Columns menu
  const effectiveColVisibility: VisibilityState = { customer_phone: false, customer_email: false, ...colVisibility }

  const visibleColumns = columns.filter((col) => {
    const key = (col as { accessorKey?: string }).accessorKey ?? col.id
    return key === undefined || effectiveColVisibility[key] !== false
  })

  return (
    <div className="space-y-4">

      {/* ── Repair Dashboard Stats ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-on-surface">Repairs</h1>
            <button
              onClick={() => router.push('/repairs/settings')}
              className="text-sm font-medium text-blue-600 hover:underline hover:text-blue-700 transition-colors"
            >
              Settings
            </button>
          </div>
          <p className="text-sm text-on-surface-variant">Real-time overview of your workshop performance.</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-outline-variant bg-surface-container p-1">
          {(['month', '3months', '6months', 'year'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setStatsPeriod(p)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                statsPeriod === p
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {p === 'month' ? 'Month' : p === '3months' ? '3M' : p === '6months' ? '6M' : 'Year'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {/* Total Repairs */}
        <div className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest pb-4 pt-5 px-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Total Repairs</p>
              {repairStats ? (
                <p className="mt-2 text-3xl font-bold text-on-surface">{repairStats.total_repairs}</p>
              ) : (
                <div className="mt-2 h-8 w-24 rounded bg-surface-container animate-pulse" />
              )}
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-container">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
          </div>
          {repairStats ? (
            <p className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">
              <TrendingUp className="h-3 w-3" />
              {repairStats.repairs_completed} completed this period
            </p>
          ) : (
            <div className="mt-3 h-4 w-36 rounded bg-surface-container animate-pulse" />
          )}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary" />
        </div>

        {/* Revenue */}
        <div className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest pb-4 pt-5 px-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Revenue</p>
              {repairStats ? (
                <p className="mt-2 text-2xl font-bold text-on-surface">{formatCurrency(repairStats.total_sales)}</p>
              ) : (
                <div className="mt-2 h-8 w-28 rounded bg-surface-container animate-pulse" />
              )}
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-tertiary-container/40">
              <DollarSign className="h-5 w-5 text-tertiary" />
            </div>
          </div>
          {repairStats ? (
            <p className="mt-3 flex items-center gap-1 text-xs font-medium text-tertiary">
              <TrendingUp className="h-3 w-3" />
              total this period
            </p>
          ) : (
            <div className="mt-3 h-4 w-20 rounded bg-surface-container animate-pulse" />
          )}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-tertiary" />
        </div>

        {/* Profit */}
        <div className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest pb-4 pt-5 px-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Profit</p>
              {repairStats ? (
                <p className={`mt-2 text-2xl font-bold ${repairStats.repairs_profit >= 0 ? 'text-green-600' : 'text-error'}`}>
                  {formatCurrency(repairStats.repairs_profit)}
                </p>
              ) : (
                <div className="mt-2 h-8 w-28 rounded bg-surface-container animate-pulse" />
              )}
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
          </div>
          {repairStats ? (
            <p className="mt-3 flex items-center gap-1 text-xs font-medium text-green-600">
              <TrendingUp className="h-3 w-3" />
              after parts cost
            </p>
          ) : (
            <div className="mt-3 h-4 w-24 rounded bg-surface-container animate-pulse" />
          )}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-green-500" />
        </div>

        {/* Open Jobs */}
        <div className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest pb-4 pt-5 px-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Open Jobs</p>
              {repairStats ? (
                <p className="mt-2 text-3xl font-bold text-on-surface">{repairStats.repairs_open}</p>
              ) : (
                <div className="mt-2 h-8 w-16 rounded bg-surface-container animate-pulse" />
              )}
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-yellow-light">
              <Wrench className="h-5 w-5 text-[#b45309]" />
            </div>
          </div>
          {repairStats ? (
            <p className="mt-3 flex items-center gap-1 text-xs font-medium text-[#b45309]">
              <Clock className="h-3 w-3" />
              Avg. 2h turnaround
            </p>
          ) : (
            <div className="mt-3 h-4 w-36 rounded bg-surface-container animate-pulse" />
          )}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-brand-yellow" />
        </div>

        {/* Completed Jobs */}
        <div className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest pb-4 pt-5 px-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Completed Jobs</p>
              {repairStats ? (
                <p className="mt-2 text-3xl font-bold text-on-surface">{repairStats.repairs_completed}</p>
              ) : (
                <div className="mt-2 h-8 w-12 rounded bg-surface-container animate-pulse" />
              )}
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-container">
              <CheckCircle className="h-5 w-5 text-primary" />
            </div>
          </div>
          {repairStats ? (
            <p className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">
              <CheckCircle className="h-3 w-3" />
              {repairStats.repairs_completed === 0 ? 'None completed yet' : 'Completed this period'}
            </p>
          ) : (
            <div className="mt-3 h-4 w-28 rounded bg-surface-container animate-pulse" />
          )}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary" />
        </div>
      </div>

      <RepairInvoiceModal
        open={invoiceModalOpen}
        onClose={() => setInvoiceModalOpen(false)}
        repair={selectedInvoiceRepair}
        settings={invoiceSettings}
        branch={activeBranch}
      />

      {/* ── List header ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-on-surface-variant">{total} total jobs</p>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-outline-variant bg-surface-container-low p-0.5">
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === 'list' ? 'bg-surface-container-lowest shadow-sm text-on-surface' : 'text-on-surface-variant hover:text-on-surface'
                }`}
            >
              <List className="h-3.5 w-3.5" />
              List
            </button>
            <button
              onClick={() => setView('kanban')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === 'kanban' ? 'bg-surface-container-lowest shadow-sm text-on-surface' : 'text-on-surface-variant hover:text-on-surface'
                }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Kanban
            </button>
          </div>
          <button
            onClick={() => fetchRepairs()}
            disabled={repairsFetching}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:border-gray-300 hover:text-gray-900 transition-colors disabled:opacity-50"
            title="Refresh repairs"
          >
            <RefreshCw className={`h-4 w-4 ${repairsFetching ? 'animate-spin' : ''}`} />
          </button>
          <Button onClick={openModal}>
            <Plus className="h-4 w-4" />
            New Repair
          </Button>
        </div>
      </div>

      {/* Filters — only shown in list view */}
      {view === 'list' && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search by job #, device, email or phone..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <Select
            options={[
              { value: '', label: 'All Statuses' },
              ...allStatusOptions.map((o) => ({ value: o.value, label: o.label })),
            ]}
            value={statusFilter}
            onValueChange={(v) => { setStatusFilter(v); setPage(0) }}
            placeholder="All Statuses"
            className="w-40"
          />

          <div className="h-6 w-px bg-gray-200 mx-1" />

          <button
            onClick={() => exportCSV(repairs)}
            className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <FileDown className="h-3.5 w-3.5" /> Export CSV
          </button>
          <button
            onClick={() => exportExcel(repairs)}
            className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
          </button>
          <button
            onClick={() => exportPDF(repairs)}
            className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
          <div className="relative" ref={colMenuRef}>
            <button
              onClick={() => setColMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Columns className="h-3.5 w-3.5" /> Columns
            </button>
            {colMenuOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-xl border border-gray-700 bg-gray-900 py-2 shadow-xl">
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Toggle columns</p>
                {TOGGLEABLE_COLS.map((key) => {
                  const isCustomerDetail = key === 'customer_phone' || key === 'customer_email'
                  const checked = effectiveColVisibility[key] !== false
                  return (
                    <label key={key} className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-gray-800 transition-colors ${isCustomerDetail ? 'pl-6' : ''}`}>
                      <span className={isCustomerDetail ? 'text-gray-400' : ''}>{isCustomerDetail ? '↳ ' : ''}{COL_LABELS[key]}</span>
                      <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${checked ? 'bg-teal-500' : 'bg-gray-600'}`}>
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                        <input
                          type="checkbox"
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          checked={checked}
                          onChange={(e) => setColVisibility((v) => ({ ...v, [key]: e.target.checked }))}
                        />
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* List or Kanban */}
      {view === 'list' ? (
        <DataTable
          data={repairs}
          columns={visibleColumns}
          isLoading={loading}
          totalCount={total}
          pageIndex={page}
          pageSize={20}
          onPageChange={setPage}
          emptyMessage="No repair jobs found. Create your first one!"
        />
      ) : (
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-64 w-60 shrink-0 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : (
            <KanbanBoard repairs={repairs} onStatusChange={handleStatusChange} customStatuses={customStatuses} />
          )}
        </div>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Repair Job?"
        description={confirmDelete ? `Are you sure you want to delete repair ${confirmDelete.jobNumber}? This action cannot be undone.` : ''}
        confirmLabel="Delete"
        loading={isDeleting}
      />

      {/* ── 2-Step New Repair Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Job Sheet" size="2xl">
        {/* Step indicator */}
        <div className="mb-5 flex items-center gap-2">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${modalStep === s ? 'bg-gray-900 text-white' : modalStep > s ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {s}
              </div>
              <span className={`text-sm font-medium ${modalStep === s ? 'text-gray-900' : 'text-gray-400'}`}>
                {s === 1 ? 'Customer' : 'Job Details'}
              </span>
              {s < 2 && <div className="mx-1 h-px w-8 bg-gray-200" />}
            </div>
          ))}
        </div>

        {/* ── STEP 1: Customer ── */}
        {modalStep === 1 && (
          <div className="space-y-4">

            {/* Existing-customer pill — shown once a suggestion is selected */}
            {selectedCustomer && (
              <div className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">
                  {selectedCustomer.first_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-teal-900 truncate">
                    {selectedCustomer.first_name} {selectedCustomer.last_name ?? ''}
                  </p>
                  <p className="text-xs text-teal-700 truncate">{selectedCustomer.phone ?? selectedCustomer.email ?? 'Existing customer'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedCustomer(null); setNewCust(EMPTY_NEW_CUST); setStep1Error(''); setPhoneError('') }}
                  className="shrink-0 rounded-md p-1 text-teal-600 hover:bg-teal-100 transition-colors"
                  title="Change customer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Name + Email */}
            <div className="grid grid-cols-2 gap-3">
              {/* Customer Name — autocomplete on type */}
              <div className="relative">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Customer Name <span className="text-red-400">*</span>
                </label>
                <input
                  readOnly={!!selectedCustomer}
                  value={newCust.first_name}
                  onChange={(e) => {
                    setNewCust((p) => ({ ...p, first_name: e.target.value }))
                    triggerCustSearch(e.target.value, 'name')
                  }}
                  onFocus={() => { if (!newCust.first_name) fetchRecentCustomers('name') }}
                  onBlur={() => setTimeout(() => setShowSuggestions(null), 150)}
                  placeholder="Enter Customer Name"
                  className={`h-9 w-full rounded-lg border px-3 text-sm transition focus:outline-none focus:ring-2 ${
                    selectedCustomer
                      ? 'border-gray-200 bg-gray-50 text-gray-600 cursor-not-allowed'
                      : 'border-gray-300 focus:border-gray-900 focus:ring-gray-900/10'
                  }`}
                />
                {custSearchLoading && showSuggestions === null && newCust.first_name.length >= 2 && (
                  <div className="absolute right-3 top-8 h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                )}
                {showSuggestions === 'name' && custSuggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                    <ul className="max-h-52 overflow-y-auto py-1">
                      {custSuggestions.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); handleCustSuggestionSelect(c) }}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">
                              {c.first_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {c.first_name} {c.last_name ?? ''}
                              </p>
                              <p className="text-xs text-gray-500 truncate">{c.phone ?? c.email ?? ''}</p>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Email */}
              <div className="relative">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Customer Email</label>
                <input
                  type="email"
                  readOnly={!!selectedCustomer}
                  value={newCust.email}
                  onChange={(e) => {
                    setNewCust((p) => ({ ...p, email: e.target.value }))
                    triggerCustSearch(e.target.value, 'email')
                  }}
                  onFocus={() => { if (!newCust.email) fetchRecentCustomers('email') }}
                  onBlur={() => setTimeout(() => setShowSuggestions(null), 150)}
                  placeholder="Enter Customer Email"
                  className={`h-9 w-full rounded-lg border px-3 text-sm transition focus:outline-none focus:ring-2 ${
                    selectedCustomer
                      ? 'border-gray-200 bg-gray-50 text-gray-600 cursor-not-allowed'
                      : 'border-gray-300 focus:border-gray-900 focus:ring-gray-900/10'
                  }`}
                />
                {showSuggestions === 'email' && custSuggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                    <ul className="max-h-52 overflow-y-auto py-1">
                      {custSuggestions.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); handleCustSuggestionSelect(c) }}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">
                              {c.first_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {c.first_name} {c.last_name ?? ''}
                              </p>
                              <p className="text-xs text-gray-500 truncate">{c.email ?? c.phone ?? ''}</p>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Business Name + Phone */}
            <div className="grid grid-cols-2 gap-3">
              {/* Business Name */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Business Name</label>
                <input
                  readOnly={!!selectedCustomer}
                  value={newCust.business_name}
                  onChange={(e) => setNewCust((p) => ({ ...p, business_name: e.target.value }))}
                  placeholder="Enter Business Name"
                  className={`h-9 w-full rounded-lg border px-3 text-sm transition focus:outline-none focus:ring-2 ${
                    selectedCustomer
                      ? 'border-gray-200 bg-gray-50 text-gray-600 cursor-not-allowed'
                      : 'border-gray-300 focus:border-gray-900 focus:ring-gray-900/10'
                  }`}
                />
              </div>

              {/* Phone Number — autocomplete on type */}
              <div className="relative">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Phone Number <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  readOnly={!!selectedCustomer}
                  value={newCust.phone}
                  onChange={(e) => {
                    const filtered = e.target.value.replace(/[^\d+\s\-().]/g, '')
                    setNewCust((p) => ({ ...p, phone: filtered }))
                    if (phoneError) setPhoneError(validatePhone(filtered))
                    triggerCustSearch(filtered, 'phone')
                  }}
                  onFocus={() => { if (!newCust.phone) fetchRecentCustomers('phone') }}
                  onBlur={() => {
                    if (!selectedCustomer) setPhoneError(validatePhone(newCust.phone))
                    setTimeout(() => setShowSuggestions(null), 150)
                  }}
                  placeholder="e.g. +44 7911 123456"
                  maxLength={20}
                  className={`h-9 w-full rounded-lg border px-3 text-sm transition focus:outline-none focus:ring-2 ${
                    selectedCustomer
                      ? 'border-gray-200 bg-gray-50 text-gray-600 cursor-not-allowed'
                      : phoneError
                        ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20'
                        : 'border-gray-300 focus:border-gray-900 focus:ring-gray-900/10'
                  }`}
                />
                {phoneError && !selectedCustomer && (
                  <p className="mt-1 text-xs text-red-500">{phoneError}</p>
                )}
                {showSuggestions === 'phone' && custSuggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                    <ul className="max-h-52 overflow-y-auto py-1">
                      {custSuggestions.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); handleCustSuggestionSelect(c) }}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">
                              {c.first_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {c.first_name} {c.last_name ?? ''}
                              </p>
                              <p className="text-xs text-gray-500 truncate">{c.phone ?? c.email ?? ''}</p>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Address — full width */}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Customer Address</label>
              <textarea
                rows={2}
                readOnly={!!selectedCustomer}
                value={newCust.address}
                onChange={(e) => setNewCust((p) => ({ ...p, address: e.target.value }))}
                placeholder="Enter Customer Address"
                className={`w-full rounded-lg border px-3 py-2 text-sm transition focus:outline-none focus:ring-2 resize-none ${
                  selectedCustomer
                    ? 'border-gray-200 bg-gray-50 text-gray-600 cursor-not-allowed'
                    : 'border-gray-300 focus:border-gray-900 focus:ring-gray-900/10'
                }`}
              />
            </div>

            {step1Error && (
              <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{step1Error}</p>
            )}

            <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Close</Button>
              <Button onClick={goToStep2}>Next →</Button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Job Details ── */}
        {modalStep === 2 && (() => {
          // STRICT cascade: Type → Brand → Model
          // Each level only shows items associated with the parent selection.
          // No fallbacks to "all" — if a brand has no models yet, the dropdown
          // is empty and the user creates a new one via the combobox.
          const filteredBrands = jobData.device_type
            ? [...new Set(
                deviceData.raw
                  .filter((d) => d.device_type === jobData.device_type)
                  .map((d) => d.device_brand)
                  .filter(Boolean) as string[]
              )]
            : deviceData.brands

          const filteredModels = jobData.device_brand
            ? [...new Set(
                deviceData.raw
                  .filter((d) => d.device_brand === jobData.device_brand)
                  .map((d) => d.device_model)
                  .filter(Boolean) as string[]
              )]
            : jobData.device_type
            ? [...new Set(
                deviceData.raw
                  .filter((d) => d.device_type === jobData.device_type)
                  .map((d) => d.device_model)
                  .filter(Boolean) as string[]
              )]
            : deviceData.models
          const remaining = (parseFloat(jobData.estimated_cost) || 0) - (parseFloat(jobData.deposit_paid) || 0)
          const pricePending = jobData.price_pending
          const inp = 'h-8 w-full rounded-md border-2 border-indigo-200 bg-white px-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20'
          const sel = `${inp} appearance-none`
          const lbl = 'mb-0.5 block text-[11px] font-bold uppercase tracking-wide text-indigo-400'

          return (
            <div className="space-y-2.5">

              {/* Row A: Device Type | Brand | Model | IMEI */}
              <div>
                <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                  <Smartphone className="h-2.5 w-2.5" /> Device
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {/* TYPE */}
                  <div>
                    <label className={lbl}>Type <span className="text-red-400">*</span></label>
                    <CreatableCombobox
                      options={deviceData.types.map(t => ({ value: t, label: t }))}
                      value={jobData.device_type}
                      onChange={(v) => setJobData((p) => ({ ...p, device_type: v, device_brand: '', device_model: '' }))}
                      onCreate={createDeviceType}
                      placeholder="Phone…"
                      createLabel="Add type"
                    />
                  </div>

                  {/* BRAND — locked until type chosen */}
                  <div>
                    <label className={`${lbl} flex items-center gap-1`}>
                      Brand <span className="text-red-400">*</span>
                      {!jobData.device_type && <Lock className="h-2.5 w-2.5 text-gray-300" />}
                    </label>
                    {jobData.device_type ? (
                      <CreatableCombobox
                        options={filteredBrands.map(b => ({ value: b, label: b }))}
                        value={jobData.device_brand}
                        onChange={(v) => setJobData((p) => ({ ...p, device_brand: v, device_model: '' }))}
                        onCreate={createDeviceBrand}
                        placeholder="Apple…"
                        createLabel="Add brand"
                      />
                    ) : (
                      <div className="flex h-9 w-full cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 text-sm text-gray-300 select-none">
                        <Lock className="h-3.5 w-3.5 shrink-0" />
                        Select type first
                      </div>
                    )}
                  </div>

                  {/* MODEL — locked until brand chosen */}
                  <div>
                    <label className={`${lbl} flex items-center gap-1`}>
                      Model <span className="text-red-400">*</span>
                      {!jobData.device_brand && <Lock className="h-2.5 w-2.5 text-gray-300" />}
                    </label>
                    {jobData.device_brand ? (
                      <CreatableCombobox
                        options={filteredModels.map(m => ({ value: m, label: m }))}
                        value={jobData.device_model}
                        onChange={(v) => setJobData((p) => ({ ...p, device_model: v }))}
                        onCreate={createDeviceModel}
                        placeholder="iPhone 15…"
                        createLabel="Add model"
                      />
                    ) : (
                      <div className="flex h-9 w-full cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 text-sm text-gray-300 select-none">
                        <Lock className="h-3.5 w-3.5 shrink-0" />
                        Select brand first
                      </div>
                    )}
                  </div>

                  {/* IMEI */}
                  <div>
                    <label className={lbl}>IMEI / Serial</label>
                    <input value={jobData.imei} onChange={(e) => setJobData((p) => ({ ...p, imei: e.target.value }))} placeholder="Enter IMEI…" className={inp} />
                  </div>
                </div>
                {deviceError && (
                  <p className="mt-1.5 text-xs text-red-500 bg-red-50 border border-red-200 rounded-md px-3 py-1.5">{deviceError}</p>
                )}
              </div>

              <div className="h-px bg-gray-100" />

              {/* REPAIR PARTS */}
              <div>
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                  <Wrench className="h-2.5 w-2.5" /> Repair Parts
                </p>

                {(!jobData.device_type || !jobData.device_brand || !jobData.device_model) && (
                  <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-600">
                    Select Device Type, Brand and Model above to add repair parts.
                  </p>
                )}

                {/* Parts search input */}
                <div className="relative" ref={partDropRef}>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                      <input
                        value={partQuery}
                        onChange={(e) => { setPartQuery(e.target.value); searchParts(e.target.value) }}
                        onFocus={() => { if (partResults.length > 0 || partQuery.trim()) setShowPartDrop(true) }}
                        placeholder="Search inventory parts…"
                        className={`${inp} pl-7`}
                        disabled={!jobData.device_model}
                      />
                      {partSearchLoading && (
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
                      )}
                    </div>
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
                              <span className="text-gray-700">{p.name}</span>
                              <span className="text-xs font-semibold text-teal-700">£{(p.selling_price ?? 0).toFixed(2)}</span>
                            </button>
                          </li>
                        ))}
                        {partQuery.trim() && (
                          <li className="border-t border-gray-100">
                            <div className="flex flex-col gap-1.5 px-3 py-2">
                              <span className="text-xs italic text-gray-500">Add &quot;{partQuery.trim()}&quot;</span>
                              <div className="flex items-center gap-2">
                                <div className="flex flex-1 flex-col gap-0.5">
                                  <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Cost £</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={quickPartCost}
                                    onChange={(e) => setQuickPartCost(e.target.value)}
                                    placeholder="0.00"
                                    className="h-7 w-full rounded border border-gray-200 bg-gray-50 px-2 text-xs text-gray-900"
                                    onMouseDown={(e) => e.stopPropagation()}
                                  />
                                </div>
                                <div className="flex flex-1 flex-col gap-0.5">
                                  <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Price £</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
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

                {/* Parts line items table */}
                {repairParts.length > 0 && (
                  <div className="mt-2 overflow-hidden rounded-lg border border-gray-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 font-semibold text-gray-500">
                          <th className="px-3 py-1.5 text-left">Part</th>
                          <th className="w-16 px-2 py-1.5 text-center">Qty</th>
                          <th className="w-20 px-2 py-1.5 text-right text-gray-400">Cost £</th>
                          <th className="w-20 px-2 py-1.5 text-right">Price £</th>
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
                                type="number"
                                min="1"
                                value={p.qty}
                                onChange={(e) => setRepairParts((prev) => prev.map((r) => r.tempId === p.tempId ? { ...r, qty: Math.max(1, parseInt(e.target.value) || 1) } : r))}
                                className="h-6 w-12 rounded border border-gray-200 px-1 text-center text-xs"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={p.unit_cost}
                                onChange={(e) => setRepairParts((prev) => prev.map((r) => r.tempId === p.tempId ? { ...r, unit_cost: parseFloat(e.target.value) || 0 } : r))}
                                className="h-6 w-16 rounded border border-gray-100 bg-gray-50 px-1 text-right text-xs text-gray-500"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={p.unit_price}
                                onChange={(e) => setRepairParts((prev) => prev.map((r) => r.tempId === p.tempId ? { ...r, unit_price: parseFloat(e.target.value) || 0 } : r))}
                                className="h-6 w-16 rounded border border-gray-200 px-1 text-right text-xs"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right font-semibold text-gray-700">£{(p.unit_price * p.qty).toFixed(2)}</td>
                            <td className="px-1 py-1.5 text-center">
                              <button
                                type="button"
                                onClick={() => setRepairParts((prev) => prev.filter((r) => r.tempId !== p.tempId))}
                                className="text-red-400 hover:text-red-600 transition-colors"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-200 bg-gray-50">
                          <td colSpan={4} className="px-3 py-1.5 text-right text-xs font-bold text-gray-600">Parts Total:</td>
                          <td className="px-2 py-1.5 text-right text-xs font-bold text-gray-900">
                            £{repairParts.reduce((s, p) => s + p.unit_price * p.qty, 0).toFixed(2)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              <div className="h-px bg-gray-100" />

              {/* Row B: Fault | Due Date | Status | Assigned To */}
              <div>
                <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                  <Wrench className="h-2.5 w-2.5" /> Fault & Assignment
                </p>
                <div className="grid grid-cols-4 gap-2">
                  <div className="col-span-2">
                    <label className={lbl}>Fault <span className="text-red-400">*</span></label>
                    <MultiComboInput
                      values={jobData.faults}
                      onAdd={(v) => {
                        setJobData((p) => ({ ...p, faults: [...p.faults, v] }))
                        const isNew = !faults.some((f) => f.name.toLowerCase() === v.toLowerCase())
                        if (isNew) {
                          // Optimistically add to cache so it shows instantly in the dropdown
                          queryClient.setQueryData<RepairMeta>(['repairs-meta', activeBranch?.id], (old) => {
                            if (!old) return old
                            const tempFault: RepairFault = { id: `temp-${Date.now()}`, name: v, sort_order: 0, created_at: new Date().toISOString(), business_id: '' }
                            return { ...old, faults: [...old.faults, tempFault] }
                          })
                          fetch('/api/repairs/faults', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: v }),
                          }).then((r) => r.ok && queryClient.invalidateQueries({ queryKey: ['repairs-meta', activeBranch?.id] })).catch(() => {})
                        }
                      }}
                      onRemove={(v) => setJobData((p) => ({ ...p, faults: p.faults.filter((f) => f !== v) }))}
                      options={faults.map((f) => f.name)}
                      placeholder="Select or type fault…"
                    />
                  </div>
                  <div>
                    <label className={lbl}>Due Date</label>
                    <input
                      type="date"
                      min={new Date().toISOString().split('T')[0]}
                      value={jobData.due_date}
                      onChange={(e) => setJobData((p) => ({ ...p, due_date: e.target.value }))}
                      className={inp}
                    />
                  </div>
                  <div>
                    <label className={lbl}>Status</label>
                    <select value={jobData.status} onChange={(e) => setJobData((p) => ({ ...p, status: e.target.value }))} className={sel}>
                      <option value="">— Status —</option>
                      {customStatuses.map((cs) => <option key={cs.id} value={cs.name}>{cs.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* Row C: Total | Deposit | Remaining | Assigned To */}
              <div>
                <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                  <DollarSign className="h-2.5 w-2.5" /> Financials & Assignment
                </p>
                {/* Price Pending toggle */}
                <label className="mb-2 flex cursor-pointer items-center gap-2.5 w-fit">
                  <div
                    onClick={() => setJobData((p) => ({ ...p, price_pending: !p.price_pending, estimated_cost: !p.price_pending ? '' : p.estimated_cost, deposit_paid: !p.price_pending ? '' : p.deposit_paid }))}
                    className={`relative flex h-5 w-9 items-center rounded-full transition-colors ${pricePending ? 'bg-amber-500' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${pricePending ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                  </div>
                  <span className="text-[11px] font-semibold text-gray-600">
                    {pricePending ? (
                      <span className="flex items-center gap-1 text-amber-600"><span>⚠</span> Issue Not Found — Price TBD</span>
                    ) : 'No fault found / Price TBD'}
                  </span>
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {/* Job Fee (labour) */}
                  <div>
                    <label className={lbl}>Job Fee (Labour)</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">£</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={pricePending}
                        value={jobData.job_fee}
                        onChange={(e) => {
                          const fee = e.target.value
                          const partsTotal = repairParts.reduce((s, p) => s + p.unit_price * p.qty, 0)
                          const total = (parseFloat(fee) || 0) + partsTotal
                          setJobData((p) => ({ ...p, job_fee: fee, estimated_cost: total.toFixed(2) }))
                        }}
                        placeholder="0.00"
                        className={`${inp} pl-6 ${pricePending ? 'opacity-40 cursor-not-allowed' : ''}`}
                      />
                    </div>
                  </div>
                  {/* Total Charges = job fee + parts */}
                  <div>
                    <label className={lbl}>Total Charges {!pricePending && <span className="text-red-400">*</span>}</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">£</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={pricePending}
                        value={jobData.estimated_cost}
                        onChange={(e) => {
                          setJobData((p) => ({ ...p, estimated_cost: e.target.value }))
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
                        className={`${inp} pl-6 ${pricePending ? 'opacity-40 cursor-not-allowed' : ''} ${chargesError ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20' : ''}`}
                      />
                    </div>
                    {chargesError && (
                      <p className="mt-1 text-xs text-red-500">{chargesError}</p>
                    )}
                  </div>
                  <div>
                    <label className={lbl}>Deposit</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">£</span>
                      <input type="number" step="0.01" min="0" disabled={pricePending} value={jobData.deposit_paid} onChange={(e) => setJobData((p) => ({ ...p, deposit_paid: e.target.value }))} placeholder={pricePending ? 'TBD' : '0.00'} className={`${inp} pl-6 ${pricePending ? 'opacity-40 cursor-not-allowed' : ''}`} />
                    </div>
                  </div>
                  <div>
                    <label className={lbl}>Remaining</label>
                    <div className={`flex h-8 items-center rounded-md border px-2.5 text-sm font-semibold ${
                      pricePending
                        ? 'border-amber-200 bg-amber-50 text-amber-600'
                        : remaining > 0 ? 'border-orange-200 bg-orange-50 text-orange-600' : 'border-green-200 bg-green-50 text-green-600'
                    }`}>
                      {pricePending ? 'TBD' : `£${remaining.toFixed(2)}`}
                    </div>
                  </div>
                  <div>
                    <label className={lbl}>Assigned To <span className="font-normal normal-case text-gray-300">(opt)</span></label>
                    {activeBranch && (
                      <AsyncEmployeeSelect
                        branchId={activeBranch.id}
                        value={jobData.assigned_to ?? ''}
                        onChange={(id) => setJobData((p) => ({ ...p, assigned_to: id }))}
                        label=""
                        placeholder="Search employee..."
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* Row D: Lock / Passcode / Pattern */}
              <div>
                <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                  <Lock className="h-2.5 w-2.5" /> Device Lock
                </p>
                <div className="flex items-center gap-2 mb-2">
                  {(['', 'passcode', 'pattern'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setJobData((p) => ({ ...p, lock_type: t, passcode: '' }))}
                      className={`rounded-md border px-3 py-1 text-xs font-medium capitalize transition-colors ${jobData.lock_type === t ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                      {t === '' ? 'None' : t}
                    </button>
                  ))}
                </div>
                {jobData.lock_type === 'passcode' && (
                  <div className="max-w-[200px]">
                    <label className={lbl}>Passcode / PIN</label>
                    <input
                      type="text"
                      value={jobData.passcode}
                      onChange={(e) => setJobData((p) => ({ ...p, passcode: e.target.value }))}
                      placeholder="Enter passcode…"
                      className={inp}
                    />
                  </div>
                )}
                {jobData.lock_type === 'pattern' && (
                  <div className="flex flex-col items-start gap-1">
                    <label className={lbl}>Draw Pattern</label>
                    <PatternLock
                      value={jobData.passcode}
                      onChange={(v) => setJobData((p) => ({ ...p, passcode: v }))}
                      size={180}
                    />
                    {jobData.passcode && (
                      <button
                        type="button"
                        onClick={() => setJobData((p) => ({ ...p, passcode: '' }))}
                        className="mt-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                      >
                        Clear pattern
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="h-px bg-gray-100" />

              {/* Row E: Customer Note | Staff Note */}
              <div>
                <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                  <StickyNote className="h-2.5 w-2.5" /> Notes
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={lbl}>Customer Note</label>
                    <textarea rows={2} value={jobData.customer_note} onChange={(e) => setJobData((p) => ({ ...p, customer_note: e.target.value }))} placeholder="Visible to customer…" className="w-full resize-none rounded-md border border-indigo-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/20" />
                  </div>
                  <div>
                    <label className={lbl}>Staff Note</label>
                    <textarea rows={2} value={jobData.staff_note} onChange={(e) => setJobData((p) => ({ ...p, staff_note: e.target.value }))} placeholder="Internal only…" className="w-full resize-none rounded-md border border-indigo-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/20" />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2.5">
                <button onClick={() => setModalStep(1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors">
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                  <Button onClick={createRepair} loading={submitting} disabled={!jobData.device_type || !jobData.device_brand || !jobData.device_model || jobData.faults.length === 0 || (!jobData.price_pending && (!jobData.estimated_cost.trim() || isNaN(parseFloat(jobData.estimated_cost)) || parseFloat(jobData.estimated_cost) < 0))}>
                    Create Job
                  </Button>
                </div>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* ── Edit Job Sheet Modal ── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Job Sheet">
        {editRepair && (() => {
          const total = parseFloat(editData.estimated_cost) || 0
          const deposit = parseFloat(editData.deposit_paid) || 0
          const remaining = total - deposit
          const inp = 'h-10 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-700/10'
          const lbl = 'mb-1 block text-sm font-semibold text-gray-800'
          return (
            <div className="space-y-4">
              {/* Ticket No */}
              <div>
                <label className={lbl}>Ticket No <span className="text-red-500">*</span></label>
                <input readOnly value={editRepair.job_number} className="h-10 w-full rounded-lg border border-gray-200 bg-gray-100 px-3 text-sm text-gray-500 cursor-not-allowed" />
              </div>

              {/* Due Date */}
              <div>
                <label className={lbl}>Due Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={editData.due_date}
                  onChange={(e) => {
                    setEditData((p) => ({ ...p, due_date: e.target.value }))
                    const today = new Date().toISOString().split('T')[0]
                    setEditErrors((p) => ({ ...p, due_date: !e.target.value ? 'Due date is required.' : e.target.value < today ? 'Due date cannot be in the past.' : undefined }))
                  }}
                  onBlur={(e) => {
                    const today = new Date().toISOString().split('T')[0]
                    setEditErrors((p) => ({ ...p, due_date: !e.target.value ? 'Due date is required.' : e.target.value < today ? 'Due date cannot be in the past.' : undefined }))
                  }}
                  className={`${inp} ${editErrors.due_date ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20' : ''}`}
                />
                {editErrors.due_date && <p className="mt-1 text-xs text-red-500">{editErrors.due_date}</p>}
              </div>

              {/* Total Repair Charges */}
              <div>
                <label className={lbl}>Total Repair Charges <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editData.estimated_cost}
                  onChange={(e) => {
                    setEditData((p) => ({ ...p, estimated_cost: e.target.value }))
                    if (editErrors.estimated_cost) {
                      const v = parseFloat(e.target.value)
                      setEditErrors((p) => ({ ...p, estimated_cost: !e.target.value.trim() || isNaN(v) || v < 0 ? 'Total Repair Charges is required and must be a valid amount.' : undefined }))
                    }
                  }}
                  onBlur={(e) => {
                    const v = parseFloat(e.target.value)
                    if (!e.target.value.trim() || isNaN(v) || v < 0) setEditErrors((p) => ({ ...p, estimated_cost: 'Total Repair Charges is required and must be a valid amount.' }))
                  }}
                  placeholder="0.00"
                  className={`${inp} ${editErrors.estimated_cost ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20' : ''}`}
                />
                {editErrors.estimated_cost && <p className="mt-1 text-xs text-red-500">{editErrors.estimated_cost}</p>}
              </div>

              {/* Deposit */}
              <div>
                <label className={lbl}>Deposit <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editData.deposit_paid}
                  onChange={(e) => {
                    setEditData((p) => ({ ...p, deposit_paid: e.target.value }))
                    if (editErrors.deposit_paid) {
                      const v = parseFloat(e.target.value)
                      setEditErrors((p) => ({ ...p, deposit_paid: !e.target.value.trim() || isNaN(v) || v < 0 ? 'Deposit is required and must be a valid amount.' : undefined }))
                    }
                  }}
                  onBlur={(e) => {
                    const v = parseFloat(e.target.value)
                    if (!e.target.value.trim() || isNaN(v) || v < 0) setEditErrors((p) => ({ ...p, deposit_paid: 'Deposit is required and must be a valid amount.' }))
                  }}
                  placeholder="Enter Deposit Amount"
                  className={`${inp} ${editErrors.deposit_paid ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20' : ''}`}
                />
                {editErrors.deposit_paid && <p className="mt-1 text-xs text-red-500">{editErrors.deposit_paid}</p>}
                {remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => setEditData((p) => ({ ...p, deposit_paid: String(total) }))}
                    className="mt-1.5 w-full rounded-md border border-green-300 bg-green-50 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 transition-colors"
                  >
                    Mark as Fully Paid (£{total.toFixed(2)})
                  </button>
                )}
              </div>

              {/* Remaining Charges */}
              <div>
                <label className={lbl}>Remaining Charges <span className="text-red-500">*</span></label>
                <input readOnly value={remaining.toFixed(2)} placeholder="Enter Remaining Charges" className={`h-10 w-full rounded-lg border px-3 text-sm cursor-not-allowed ${remaining > 0 ? 'border-orange-200 bg-orange-50 text-orange-600' : 'border-green-200 bg-green-50 text-green-700 font-semibold'}`} />
              </div>

              {/* Payment Method */}
              <div>
                <label className={lbl}>Payment Method :</label>
                <div className="flex gap-2">
                  {(['cash', 'card'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setEditData((p) => ({ ...p, payment_method: p.payment_method === m ? '' : m }))}
                      className={`rounded-lg border px-6 py-2 text-sm font-medium capitalize transition-colors ${editData.payment_method === m ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                    >
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Repairing Status */}
              <div>
                <label className={lbl}>Repairing Status</label>
                <select value={editData.status} onChange={(e) => setEditData((p) => ({ ...p, status: e.target.value }))} className={`${inp} appearance-none`}>
                  <option value="">— Select Status —</option>
                  {customStatuses.map((cs) => <option key={cs.id} value={cs.name}>{cs.name}</option>)}
                </select>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
                <button onClick={() => setEditOpen(false)} className="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Close
                </button>
                <Button onClick={saveEdit} loading={editSaving} className="px-6">
                  Edit
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Non-blocking email prompt */}
      {emailPrompt && (
        <RepairEmailPrompt
          repairId={emailPrompt.repairId}
          jobNumber={emailPrompt.jobNumber}
          currentStatus={emailPrompt.currentStatus}
          modal
          onClose={() => setEmailPrompt(null)}
        />
      )}

      {/* Repair slip */}
      <RepairSlipModal repair={slipRepair as any} onClose={() => setSlipRepair(null)} />
    </div>
  )
}
