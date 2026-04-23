'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Plus, Search, LayoutGrid, List, Wrench, DollarSign, AlertTriangle, Clock, TrendingUp, CheckCircle, ChevronLeft, Smartphone, StickyNote, Eye, Pencil, Trash2, FileText, Receipt, ChevronDown, FileDown, FileSpreadsheet, Printer, Columns } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/shared/data-table'
import { Modal } from '@/components/ui/modal'
import { KanbanBoard } from '@/components/repairs/kanban-board'
import { CustomerSearch } from '@/components/repairs/customer-search'
import { useAuthStore } from '@/store/auth.store'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { formatCurrency, formatCurrencyCompact, formatDateTime, formatDate } from '@/lib/utils'
import { Select } from '@/components/ui/select'
import type { ColumnDef, VisibilityState } from '@tanstack/react-table'
import type { Repair } from '@/types/database'
import { RepairEmailPrompt } from '@/components/repairs/email-prompt-modal'
import { RepairSlipModal } from '@/components/repairs/slip-modal'
import { RepairInvoiceModal } from '@/components/repairs/invoice-modal'
import { ConfirmModal } from '@/components/ui/confirm-modal'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

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

const EMPTY_NEW_CUST = { first_name: '', last_name: '', business_name: '', email: '', phone: '', address: '' }
const EMPTY_JOB = {
  device_name: '', device_type: '', device_brand: '', device_model: '',
  imei: '', fault: '', fault_custom: '',
  estimated_cost: '', deposit_paid: '',
  due_date: '', customer_note: '', staff_note: '',
  status: '', assigned_to: '',
}

function ActionsMenu({ onEdit, onSlip, onInvoice, onDelete }: {
  onEdit: () => void
  onSlip: () => void
  onInvoice: () => void
  onDelete: () => void
}) {
  const item = 'flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none transition-colors'

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors focus:outline-none"
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
      formatDate(r.created_at)
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
      formatDate(r.created_at)
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
  const html = `<html><head><title>Repairs Export</title><style>body{font-family:sans-serif;font-size:12px;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#0d7070;color:#fff}</style></head><body><h2>Repair Jobs Report</h2><p>Generated on: ${new Date().toLocaleString()}</p><table><thead><tr>${EXPORTABLE_COLUMNS.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${repairs.map(r => `<tr><td>${r.job_number}</td><td>${r.customers ? `${r.customers.first_name} ${r.customers.last_name ?? ''}`.trim() : 'N/A'}</td><td>${r.device_type ?? 'N/A'}</td><td>${r.device_brand ?? 'N/A'}</td><td>${r.device_model ?? 'N/A'}</td><td>${r.status}</td><td>$${r.actual_cost ?? r.estimated_cost ?? 0}</td><td>${formatDate(r.created_at)}</td></tr>`).join('')}</tbody></table></body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.print()
}

export default function RepairsPage() {
  const { activeBranch } = useAuthStore()
  const router = useRouter()
  const [repairs, setRepairs] = useState<RepairRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalStep, setModalStep] = useState<1 | 2>(1)
  const [existingMode, setExistingMode] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null)
  const [newCust, setNewCust] = useState(EMPTY_NEW_CUST)
  const [jobData, setJobData] = useState(EMPTY_JOB)
  const [submitting, setSubmitting] = useState(false)
  const [step1Error, setStep1Error] = useState('')

  const [emailPrompt, setEmailPrompt] = useState<{ repairId: string; jobNumber: string } | null>(null)
  const [slipRepair, setSlipRepair] = useState<RepairRow | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string, jobNumber: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [view, setView] = useState<'list' | 'kanban'>('list')
  const [colVisibility, setColVisibility] = useState<VisibilityState>({})
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const colMenuRef = useRef<HTMLDivElement>(null)

  // Edit Job Sheet modal
  const [editOpen, setEditOpen] = useState(false)
  const [editRepair, setEditRepair] = useState<RepairRow | null>(null)
  const [editData, setEditData] = useState({ due_date: '', estimated_cost: '', deposit_paid: '', payment_method: '' as '' | 'cash' | 'card', status: '' })
  const [editSaving, setEditSaving] = useState(false)

  // Custom statuses + faults + employees
  const [customStatuses, setCustomStatuses] = useState<{ id: string; name: string; color: string }[]>([])
  const [faults, setFaults] = useState<{ id: string; name: string }[]>([])
  const [employees, setEmployees] = useState<{ id: string; first_name: string; last_name: string | null }[]>([])
  const [deviceData, setDeviceData] = useState<DeviceData>({ types: [], brands: [], models: [], raw: [] })

  // Dashboard stats
  const [repairStats, setRepairStats] = useState<{
    repairs_urgent: number; total_sales: number;
  } | null>(null)
  const [invoiceSettings, setInvoiceSettings] = useState<any>(null)
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

  const fetchRepairs = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    const params = new URLSearchParams({
      branch_id: activeBranch.id,
      page: String(view === 'kanban' ? 1 : page + 1),
      limit: view === 'kanban' ? '200' : '20',
    })
    if (search) params.set('search', search)
    if (statusFilter && view === 'list') params.set('status', statusFilter)

    const res = await fetch(`/api/repairs?${params}`)
    const json = await res.json()
    setRepairs(json.data ?? [])
    setTotal(json.meta?.total ?? 0)
    setLoading(false)
  }, [activeBranch, page, search, statusFilter, view])

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
      fetchRepairs()
      setConfirmDelete(null)
    } else {
      toast.error('Failed to delete repair.')
    }
    setIsDeleting(false)
  }

  async function handleStatusChange(repairId: string, newStatus: string) {
    const prev = repairs.find((r) => r.id === repairId)?.status
    setRepairs((list) => list.map((r) => r.id === repairId ? { ...r, status: newStatus } : r))
    const res = await fetch(`/api/repairs/${repairId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, note: '', send_email: false }),
    })
    if (!res.ok && prev !== undefined) {
      setRepairs((list) => list.map((r) => r.id === repairId ? { ...r, status: prev } : r))
    }
  }

  useEffect(() => { fetchRepairs() }, [fetchRepairs])

  // Fetch supporting data - reactive to activeBranch
  useEffect(() => {
    if (!activeBranch) return
    const bid = activeBranch.id
    fetch(`/api/repairs/custom-statuses?branch_id=${bid}`).then((r) => r.json()).then((j) => { if (j.data) setCustomStatuses(j.data) })
    fetch(`/api/repairs/faults?branch_id=${bid}`).then((r) => r.json()).then((j) => { if (j.data) setFaults(j.data) })
    fetch(`/api/repairs/devices?branch_id=${bid}`).then((r) => r.json()).then((j) => { if (j.data) setDeviceData(j.data) })
  }, [activeBranch])

  useEffect(() => {
    if (!activeBranch) return
    fetch(`/api/employees?branch_id=${activeBranch.id}&limit=100`)
      .then((r) => r.json()).then((j) => { if (j.data) setEmployees(j.data) })
  }, [activeBranch])

  // Fetch repair dashboard stats
  useEffect(() => {
    if (!activeBranch) return
    fetch(`/api/dashboard?branch_id=${activeBranch.id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.data?.stats) {
          const s = json.data.stats
          setRepairStats({
            total_repairs: s.repairs_open + s.repairs_completed,
            repairs_open: s.repairs_open,
            repairs_completed: s.repairs_completed,
            repairs_urgent: s.repairs_urgent,
            total_sales: s.total_sales,
          })
        }
      })
  }, [activeBranch])

  useEffect(() => {
    if (!activeBranch) return
    fetch(`/api/settings/invoice?branch_id=${activeBranch.id}`)
      .then(r => r.json())
      .then(j => { if (j.data) setInvoiceSettings(j.data) })
  }, [activeBranch])

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
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!editRepair) return
    setEditSaving(true)
    const cf = (editRepair.custom_fields as any) ?? {}
    await fetch(`/api/repairs/${editRepair.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        estimated_cost: parseFloat(editData.estimated_cost) || null,
        deposit_paid: parseFloat(editData.deposit_paid) || 0,
        status: editData.status || undefined,
        custom_fields: { ...cf, due_date: editData.due_date || null, payment_method: editData.payment_method || null },
      }),
    })
    setEditSaving(false)
    setEditOpen(false)
    fetchRepairs()
  }

  function openModal() {
    setModalStep(1)
    setExistingMode(false)
    setSelectedCustomer(null)
    setNewCust(EMPTY_NEW_CUST)
    setJobData(EMPTY_JOB)
    setStep1Error('')
    setModalOpen(true)
  }

  async function goToStep2() {
    setStep1Error('')
    if (existingMode) {
      if (!selectedCustomer) { setStep1Error('Please search and select an existing customer.'); return }
      setModalStep(2)
    } else {
      if (!newCust.first_name.trim()) { setStep1Error('Customer name is required.'); return }
      if (!newCust.phone.trim()) { setStep1Error('Phone number is required.'); return }
      setModalStep(2)
    }
  }

  async function createRepair() {
    if (!activeBranch) return
    if (!jobData.fault.trim() && !jobData.fault_custom.trim()) return
    setSubmitting(true)

    let customerId = selectedCustomer?.id ?? null

    // Create new customer if needed
    if (!existingMode && !customerId) {
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
      customerId = custJson.data?.id ?? null
    }

    const total = parseFloat(jobData.estimated_cost) || 0
    const deposit = parseFloat(jobData.deposit_paid) || 0
    const faultText = jobData.fault === '__other__' ? jobData.fault_custom : jobData.fault

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
        serial_number: null,
        estimated_cost: total || null,
        deposit_paid: deposit,
        assigned_to: jobData.assigned_to || null,
        status: jobData.status || undefined,
        lock_type: null,
        passcode: null,
        custom_fields: {
          imei: jobData.imei || null,
          due_date: jobData.due_date || null,
          customer_note: jobData.customer_note || null,
          staff_note: jobData.staff_note || null,
        },
      }),
    })

    if (res.ok) {
      setModalOpen(false)
      fetchRepairs()
    }
    setSubmitting(false)
  }

  // All statuses come from DB — no hardcoded fallbacks
  const allStatusOptions = customStatuses.map((cs) => ({ value: cs.name, label: cs.name, color: cs.color }))

  // Map status name → color for badge rendering
  const statusColorMap = Object.fromEntries(customStatuses.map((cs) => [cs.name, cs.color]))

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
      accessorKey: 'device_type', header: 'Type', cell: ({ getValue }) => (getValue() as string) || '—'
    },
    {
      accessorKey: 'device_brand', header: 'Brand', cell: ({ getValue }) => (getValue() as string) || '—'
    },
    {
      accessorKey: 'device_model', header: 'Model', cell: ({ getValue }) => (getValue() as string) || '—'
    },
    {
      accessorKey: 'status', header: 'Status', cell: ({ getValue, row }) => {
        const s = getValue() as string
        const customColor = statusColorMap[s]
        return (
          <div className="relative group inline-block">
            <select
              value={s}
              onChange={(e) => {
                e.stopPropagation()
                handleStatusChange(row.original.id, e.target.value)
              }}
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            >
              {allStatusOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span
              className="inline-flex cursor-pointer items-center rounded-full px-2.5 py-1 text-xs font-semibold text-white group-hover:ring-2 group-hover:ring-offset-1 group-hover:ring-blue-400 transition-all"
              style={{ backgroundColor: customColor ?? '#9ca3af' }}
            >
              {s} ▾
            </span>
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
    { accessorKey: 'created_at', header: 'Created', cell: ({ getValue }) => formatDateTime(getValue() as string) },
    {
      id: 'actions', header: 'Action', size: 160,
      cell: ({ row }) => {
        const r = row.original
        return (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => router.push(`/repairs/${r.id}`)}
              className="flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-600 hover:bg-cyan-100 transition-colors"
            >
              <Eye className="h-3 w-3" /> View
            </button>
            <ActionsMenu
              onEdit={() => openEdit(r)}
              onSlip={() => setSlipRepair(r)}
              onInvoice={() => handleOpenInvoice(r)}
              onDelete={() => deleteRepair(r.id, r.job_number)}
            />
          </div>
        )
      }
    },
  ]

  const TOGGLEABLE_COLS = ['customers', 'device_type', 'device_brand', 'device_model', 'status', 'actual_cost', 'created_at']
  const COL_LABELS: Record<string, string> = { 
    customers: 'Customer', 
    device_type: 'Type', 
    device_brand: 'Brand', 
    device_model: 'Model', 
    status: 'Status', 
    actual_cost: 'Cost', 
    created_at: 'Created' 
  }

  const visibleColumns = columns.filter((col) => {
    const key = (col as { accessorKey?: string }).accessorKey ?? col.id
    return key === undefined || colVisibility[key] !== false
  })

  return (
    <div className="space-y-4">

      {/* ── Repair Dashboard Stats ── */}
      <div className="flex items-start justify-between">
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
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
              {repairStats.repairs_completed} completed this month
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
                <p className="mt-2 text-3xl font-bold text-on-surface">{formatCurrencyCompact(repairStats.total_sales)}</p>
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
              total this month
            </p>
          ) : (
            <div className="mt-3 h-4 w-20 rounded bg-surface-container animate-pulse" />
          )}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-tertiary" />
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

        {/* Urgent Jobs */}
        <div className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest pb-4 pt-5 px-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Urgent Jobs</p>
              {repairStats ? (
                <p className="mt-2 text-3xl font-bold text-on-surface">{repairStats.repairs_urgent}</p>
              ) : (
                <div className="mt-2 h-8 w-12 rounded bg-surface-container animate-pulse" />
              )}
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-error-container/20">
              <AlertTriangle className="h-5 w-5 text-error" />
            </div>
          </div>
          {repairStats ? (
            <p className={`mt-3 flex items-center gap-1 text-xs font-medium ${repairStats.repairs_urgent === 0 ? 'text-primary' : 'text-error'}`}>
              {repairStats.repairs_urgent === 0
                ? <><CheckCircle className="h-3 w-3" /> All clear</>
                : <><AlertTriangle className="h-3 w-3" /> Needs attention</>}
            </p>
          ) : (
            <div className="mt-3 h-4 w-28 rounded bg-surface-container animate-pulse" />
          )}
          <div className={`absolute bottom-0 left-0 right-0 h-1 ${repairStats && repairStats.repairs_urgent > 0 ? 'bg-error' : 'bg-outline-variant'}`} />
        </div>
      </div>

      <RepairInvoiceModal
        open={invoiceModalOpen}
        onClose={() => setInvoiceModalOpen(false)}
        repair={selectedInvoiceRepair}
        settings={invoiceSettings || {}}
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
              placeholder="Search by job # or device..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <Select
            options={[
              { value: '', label: 'All Statuses' },
              ...allStatusOptions.map((o) => ({ value: o.value, label: o.label })),
            ]}
            value={statusFilter}
            onValueChange={setStatusFilter}
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
              <Columns className="h-3.5 w-3.5" /> Column visibility
            </button>
            {colMenuOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                {TOGGLEABLE_COLS.map((key) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded text-blue-600"
                      checked={colVisibility[key] !== false}
                      onChange={(e) => setColVisibility((v) => ({ ...v, [key]: e.target.checked }))}
                    />
                    {COL_LABELS[key]}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => exportPDF(repairs)}
            className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <FileText className="h-3.5 w-3.5" /> Export PDF
          </button>
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
            <KanbanBoard repairs={repairs} onStatusChange={handleStatusChange} />
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
            {/* Toggle */}
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <button
                type="button"
                onClick={() => { setExistingMode((v) => !v); setSelectedCustomer(null); setStep1Error('') }}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${existingMode ? 'bg-gray-900' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${existingMode ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <div>
                <span className="text-sm font-semibold text-gray-800">Existing Customer</span>
                <p className="text-xs text-gray-500">{existingMode ? 'Search and select from your customer list' : 'Toggle on to search existing customers'}</p>
              </div>
            </div>

            {existingMode ? (
              <div className="space-y-3">
                {/* Search row */}
                <div className="grid grid-cols-2 gap-3 items-start">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Select Customer</label>
                    <CustomerSearch value={null} onChange={setSelectedCustomer} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Customer Name <span className="text-red-400">*</span></label>
                    <input readOnly value={selectedCustomer ? `${selectedCustomer.first_name} ${selectedCustomer.last_name ?? ''}`.trim() : ''}
                      placeholder="Auto-filled after search"
                      className="h-9 w-full rounded-lg border border-gray-200 bg-gray-100 px-3 text-sm text-gray-600 cursor-not-allowed" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Customer Email</label>
                    <input readOnly value={selectedCustomer?.email ?? ''}
                      placeholder="Auto-filled"
                      className="h-9 w-full rounded-lg border border-gray-200 bg-gray-100 px-3 text-sm text-gray-600 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Business Name</label>
                    <input readOnly value={selectedCustomer?.business_name ?? ''}
                      placeholder="Auto-filled"
                      className="h-9 w-full rounded-lg border border-gray-200 bg-gray-100 px-3 text-sm text-gray-600 cursor-not-allowed" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Phone Number <span className="text-red-400">*</span></label>
                    <input readOnly value={selectedCustomer?.phone ?? ''}
                      placeholder="Auto-filled"
                      className="h-9 w-full rounded-lg border border-gray-200 bg-gray-100 px-3 text-sm text-gray-600 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Customer Address</label>
                    <input readOnly value={selectedCustomer?.address ?? ''}
                      placeholder="Auto-filled"
                      className="h-9 w-full rounded-lg border border-gray-200 bg-gray-100 px-3 text-sm text-gray-600 cursor-not-allowed" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Customer Name <span className="text-red-400">*</span></label>
                    <input value={newCust.first_name} onChange={(e) => setNewCust((p) => ({ ...p, first_name: e.target.value }))}
                      placeholder="Enter Customer Name"
                      className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm transition focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Customer Email</label>
                    <input type="email" value={newCust.email} onChange={(e) => setNewCust((p) => ({ ...p, email: e.target.value }))}
                      placeholder="Enter Customer Email"
                      className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm transition focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Business Name</label>
                    <input value={newCust.business_name} onChange={(e) => setNewCust((p) => ({ ...p, business_name: e.target.value }))}
                      placeholder="Enter Business Name"
                      className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm transition focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Phone Number <span className="text-red-400">*</span></label>
                    <input value={newCust.phone} onChange={(e) => setNewCust((p) => ({ ...p, phone: e.target.value }))}
                      placeholder="Enter Phone Number"
                      className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm transition focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Customer Address</label>
                  <textarea rows={2} value={newCust.address} onChange={(e) => setNewCust((p) => ({ ...p, address: e.target.value }))}
                    placeholder="Enter Customer Address"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 resize-none" />
                </div>
              </div>
            )}

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
          const filteredBrands = jobData.device_type
            ? [...new Set(deviceData.raw.filter((d) => d.device_type === jobData.device_type).map((d) => d.device_brand).filter(Boolean) as string[])]
            : deviceData.brands
          const filteredModels = [...new Set(
            deviceData.raw
              .filter((d) => (!jobData.device_type || d.device_type === jobData.device_type) && (!jobData.device_brand || d.device_brand === jobData.device_brand))
              .map((d) => d.device_model).filter(Boolean) as string[]
          )]
          const remaining = (parseFloat(jobData.estimated_cost) || 0) - (parseFloat(jobData.deposit_paid) || 0)
          const inp = 'h-8 w-full rounded-md border border-indigo-200 bg-white px-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/20'
          const sel = `${inp} appearance-none`
          const lbl = 'mb-0.5 block text-[11px] font-bold uppercase tracking-wide text-outline'

          return (
            <div className="space-y-2.5">

              {/* Row A: Device Type | Brand | Model | IMEI */}
              <div>
                <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-outline">
                  <Smartphone className="h-2.5 w-2.5" /> Device
                </p>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className={lbl}>Type</label>
                    <ComboInput value={jobData.device_type} onChange={(v) => setJobData((p) => ({ ...p, device_type: v, device_brand: '', device_model: '' }))} options={deviceData.types} placeholder="Phone…" />
                  </div>
                  <div>
                    <label className={lbl}>Brand</label>
                    <ComboInput 
                      value={jobData.device_brand} 
                      onChange={(v) => setJobData((p) => ({ ...p, device_brand: v, device_model: '' }))} 
                      options={jobData.device_type ? [...new Set(deviceData.raw.filter(d => d.device_type === jobData.device_type).map(d => d.device_brand).filter(Boolean) as string[])] : []} 
                      placeholder="Apple…" 
                    />
                  </div>
                  <div>
                    <label className={lbl}>Model</label>
                    <ComboInput 
                      value={jobData.device_model} 
                      onChange={(v) => setJobData((p) => ({ ...p, device_model: v }))} 
                      options={jobData.device_brand ? [...new Set(deviceData.raw.filter(d => d.device_brand === jobData.device_brand && (!jobData.device_type || d.device_type === jobData.device_type)).map(d => d.device_model).filter(Boolean) as string[])] : []} 
                      placeholder="iPhone 15…" 
                    />
                  </div>
                  <div>
                    <label className={lbl}>IMEI / Serial</label>
                    <input value={jobData.imei} onChange={(e) => setJobData((p) => ({ ...p, imei: e.target.value }))} placeholder="Enter IMEI…" className={inp} />
                  </div>
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* Row B: Fault | Due Date | Status | Assigned To */}
              <div>
                <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-outline">
                  <Wrench className="h-2.5 w-2.5" /> Fault & Assignment
                </p>
                <div className="grid grid-cols-4 gap-2">
                  <div className="col-span-2">
                    <label className={lbl}>Fault <span className="text-red-400">*</span></label>
                    <select value={jobData.fault} onChange={(e) => setJobData((p) => ({ ...p, fault: e.target.value }))} className={sel}>
                      <option value="">— Select Fault —</option>
                      {faults.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
                      <option value="__other__">Other…</option>
                    </select>
                    {jobData.fault === '__other__' && (
                      <input value={jobData.fault_custom} onChange={(e) => setJobData((p) => ({ ...p, fault_custom: e.target.value }))} placeholder="Describe fault…" className={`mt-1 ${inp}`} />
                    )}
                  </div>
                  <div>
                    <label className={lbl}>Due Date</label>
                    <input type="date" value={jobData.due_date} onChange={(e) => setJobData((p) => ({ ...p, due_date: e.target.value }))} className={inp} />
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
                <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-outline">
                  <DollarSign className="h-2.5 w-2.5" /> Financials & Assignment
                </p>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className={lbl}>Total Charges <span className="text-red-400">*</span></label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">£</span>
                      <input type="number" step="0.01" min="0" value={jobData.estimated_cost} onChange={(e) => setJobData((p) => ({ ...p, estimated_cost: e.target.value }))} placeholder="0.00" className={`${inp} pl-6`} />
                    </div>
                  </div>
                  <div>
                    <label className={lbl}>Deposit</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">£</span>
                      <input type="number" step="0.01" min="0" value={jobData.deposit_paid} onChange={(e) => setJobData((p) => ({ ...p, deposit_paid: e.target.value }))} placeholder="0.00" className={`${inp} pl-6`} />
                    </div>
                  </div>
                  <div>
                    <label className={lbl}>Remaining</label>
                    <div className={`flex h-8 items-center rounded-md border px-2.5 text-sm font-semibold ${remaining > 0 ? 'border-orange-200 bg-orange-50 text-orange-600' : 'border-green-200 bg-green-50 text-green-600'}`}>
                      £{remaining.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <label className={lbl}>Assigned To <span className="font-normal normal-case text-gray-300">(opt)</span></label>
                    <select value={jobData.assigned_to} onChange={(e) => setJobData((p) => ({ ...p, assigned_to: e.target.value }))} className={sel}>
                      <option value="">— Employee —</option>
                      {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name ?? ''}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* Row D: Customer Note | Staff Note */}
              <div>
                <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-outline">
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
                  <Button onClick={createRepair} loading={submitting} disabled={!jobData.fault || (jobData.fault === '__other__' && !jobData.fault_custom.trim())}>
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
                <input type="date" value={editData.due_date} onChange={(e) => setEditData((p) => ({ ...p, due_date: e.target.value }))} className={inp} />
              </div>

              {/* Total Repair Charges */}
              <div>
                <label className={lbl}>Total Repair Charges <span className="text-red-500">*</span></label>
                <input type="number" step="0.01" min="0" value={editData.estimated_cost} onChange={(e) => setEditData((p) => ({ ...p, estimated_cost: e.target.value }))} placeholder="0.00" className={inp} />
              </div>

              {/* Deposit */}
              <div>
                <label className={lbl}>Deposit <span className="text-red-500">*</span></label>
                <input type="number" step="0.01" min="0" value={editData.deposit_paid} onChange={(e) => setEditData((p) => ({ ...p, deposit_paid: e.target.value }))} placeholder="Enter Deposit Amount" className={inp} />
              </div>

              {/* Remaining Charges */}
              <div>
                <label className={lbl}>Remaining Charges <span className="text-red-500">*</span></label>
                <input readOnly value={remaining.toFixed(2)} placeholder="Enter Remaining Charges" className="h-10 w-full rounded-lg border border-gray-200 bg-gray-100 px-3 text-sm text-gray-500 cursor-not-allowed" />
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
          onClose={() => setEmailPrompt(null)}
        />
      )}

      {/* Repair slip */}
      <RepairSlipModal repair={slipRepair as any} onClose={() => setSlipRepair(null)} />
    </div>
  )
}
