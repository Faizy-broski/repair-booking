'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, LayoutGrid, List, Wrench, DollarSign, AlertTriangle, Clock, TrendingUp, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, REPAIR_STATUS_VARIANTS } from '@/components/ui/badge'
import { DataTable } from '@/components/shared/data-table'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { KanbanBoard } from '@/components/repairs/kanban-board'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatCurrencyCompact, formatDateTime } from '@/lib/utils'
import { Select } from '@/components/ui/select'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'
import type { Repair } from '@/types/database'
import { RepairEmailPrompt } from '@/components/repairs/email-prompt-modal'
import { ServiceSelector } from '@/components/repairs/service-selector'
import { CustomerSearch } from '@/components/repairs/customer-search'
import { AssetPicker } from '@/components/repairs/asset-picker'
import { useRouter } from 'next/navigation'

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'received',      label: 'Received' },
  { value: 'in_progress',   label: 'In Progress' },
  { value: 'waiting_parts', label: 'Waiting Parts' },
  { value: 'repaired',      label: 'Repaired' },
  { value: 'unrepairable',  label: 'Unrepairable' },
  { value: 'collected',     label: 'Collected' },
]

interface SelectedCustomer {
  id: string
  first_name: string
  last_name: string | null
  phone: string | null
  email: string | null
}

const createSchema = z.object({
  device_type: z.string().optional(),
  device_brand: z.string().optional(),
  device_model: z.string().optional(),
  serial_number: z.string().optional(),
  issue: z.string().min(1, 'Issue description is required'),
  estimated_cost: z.number().catch(undefined as any).optional(),
  deposit_paid: z.number().catch(0).default(0),
  notify_customer: z.boolean().default(true),
})

type CreateFormData = z.infer<typeof createSchema>

interface RepairRow extends Repair {
  customers?: { first_name: string; last_name: string | null; phone: string | null; email: string | null } | null
  is_rush?: boolean
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
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null)
  const [emailPrompt, setEmailPrompt] = useState<{ repairId: string; jobNumber: string } | null>(null)
  const [view, setView] = useState<'list' | 'kanban'>('list')
  const [selectedAsset, setSelectedAsset] = useState<{ id: string; name: string; brand: string | null; model: string | null; serial_number: string | null; imei: string | null; color: string | null } | null>(null)

  // Dashboard stats
  const [repairStats, setRepairStats] = useState<{
    total_repairs: number; repairs_open: number; repairs_completed: number;
    repairs_urgent: number; total_sales: number;
  } | null>(null)

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
  })

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

  async function handleStatusChange(repairId: string, newStatus: string) {
    // Optimistic update
    setRepairs((prev) => prev.map((r) => r.id === repairId ? { ...r, status: newStatus } : r))
    await fetch(`/api/repairs/${repairId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
  }

  useEffect(() => { fetchRepairs() }, [fetchRepairs])

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

  async function onCreate(data: CreateFormData) {
    if (!activeBranch) return

    const res = await fetch('/api/repairs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: activeBranch.id,
        customer_id: selectedCustomer?.id ?? null,
        asset_id: selectedAsset?.id ?? null,
        issue: data.issue,
        device_type: data.device_type || null,
        device_brand: data.device_brand || null,
        device_model: data.device_model || null,
        serial_number: data.serial_number || null,
        estimated_cost: data.estimated_cost || null,
        deposit_paid: data.deposit_paid,
        notify_customer: data.notify_customer,
      }),
    })

    if (res.ok) {
      reset()
      setSelectedCustomer(null)
      setSelectedAsset(null)
      setSheetOpen(false)
      fetchRepairs()
    }
  }

  function openNewRepairSheet() {
    reset()
    setSelectedCustomer(null)
    setSelectedAsset(null)
    setSheetOpen(true)
  }

  const columns: ColumnDef<RepairRow>[] = [
    { accessorKey: 'job_number', header: 'Job #', cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-semibold text-blue-600">{row.original.job_number}</span>
        {row.original.is_rush && <span className="flex h-4 items-center rounded bg-orange-100 px-1.5 text-[9px] font-bold text-orange-700 uppercase tracking-widest border border-orange-200" title="Rush Job">Rush</span>}
      </div>
    )},
    { accessorKey: 'customers', header: 'Customer', cell: ({ getValue }) => {
      const c = getValue() as RepairRow['customers']
      return c ? `${c.first_name} ${c.last_name ?? ''}` : '—'
    }},
    { id: 'device', header: 'Device', cell: ({ row }) => (
      `${row.original.device_brand ?? ''} ${row.original.device_model ?? ''}`.trim() || '—'
    )},
    { accessorKey: 'status', header: 'Status', cell: ({ getValue, row }) => {
      const s = getValue() as string
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
            {STATUS_OPTIONS.filter((o) => o.value !== '').map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Badge variant={REPAIR_STATUS_VARIANTS[s]} className="cursor-pointer group-hover:ring-2 group-hover:ring-offset-1 group-hover:ring-blue-400 transition-all">
            {s.replace('_', ' ')} ▾
          </Badge>
        </div>
      )
    }},
    { accessorKey: 'actual_cost', header: 'Cost', cell: ({ getValue, row }) => {
      const v = getValue() as number | null
      return v ? formatCurrency(v) : row.original.estimated_cost ? `~${formatCurrency(row.original.estimated_cost)}` : '—'
    }},
    { accessorKey: 'created_at', header: 'Created', cell: ({ getValue }) => formatDateTime(getValue() as string) },
    { id: 'actions', header: '', cell: ({ row }) => (
      <Button size="sm" variant="ghost" className="bg-brand-teal/10 text-brand-teal hover:bg-brand-teal/20 hover:text-brand-teal" onClick={() => router.push(`/repairs/${row.original.id}`)}>
        View
      </Button>
    )},
  ]

  return (
    <div className="space-y-4">

      {/* ── Repair Dashboard Stats ── */}
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Repair Dashboard</h1>
        <p className="text-sm text-on-surface-variant">Real-time overview of your workshop performance.</p>
      </div>

      {repairStats ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* Total Repairs */}
          <div className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest pb-4 pt-5 px-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Total Repairs</p>
                <p className="mt-2 text-3xl font-bold text-on-surface">{repairStats.total_repairs}</p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-container">
                <Wrench className="h-5 w-5 text-primary" />
              </div>
            </div>
            <p className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">
              <TrendingUp className="h-3 w-3" />
              {repairStats.repairs_completed} completed this month
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary" />
          </div>

          {/* Revenue */}
          <div className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest pb-4 pt-5 px-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Revenue</p>
                <p className="mt-2 text-3xl font-bold text-on-surface">{formatCurrencyCompact(repairStats.total_sales)}</p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-tertiary-container/40">
                <DollarSign className="h-5 w-5 text-tertiary" />
              </div>
            </div>
            <p className="mt-3 flex items-center gap-1 text-xs font-medium text-tertiary">
              <TrendingUp className="h-3 w-3" />
              total this month
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-tertiary" />
          </div>

          {/* Open Jobs */}
          <div className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest pb-4 pt-5 px-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Open Jobs</p>
                <p className="mt-2 text-3xl font-bold text-on-surface">{repairStats.repairs_open}</p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-yellow-light">
                <Wrench className="h-5 w-5 text-[#b45309]" />
              </div>
            </div>
            <p className="mt-3 flex items-center gap-1 text-xs font-medium text-[#b45309]">
              <Clock className="h-3 w-3" />
              Avg. 2h turnaround
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-brand-yellow" />
          </div>

          {/* Urgent Jobs */}
          <div className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest pb-4 pt-5 px-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Urgent Jobs</p>
                <p className="mt-2 text-3xl font-bold text-on-surface">{repairStats.repairs_urgent}</p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-error-container/20">
                <AlertTriangle className="h-5 w-5 text-error" />
              </div>
            </div>
            <p className={`mt-3 flex items-center gap-1 text-xs font-medium ${repairStats.repairs_urgent === 0 ? 'text-primary' : 'text-error'}`}>
              {repairStats.repairs_urgent === 0
                ? <><CheckCircle className="h-3 w-3" /> All clear</>
                : <><AlertTriangle className="h-3 w-3" /> Needs attention</>}
            </p>
            <div className={`absolute bottom-0 left-0 right-0 h-1 ${repairStats.repairs_urgent > 0 ? 'bg-error' : 'bg-outline-variant'}`} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-container" />
          ))}
        </div>
      )}

      {/* ── List header ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-on-surface-variant">{total} total jobs</p>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-outline-variant bg-surface-container-low p-0.5">
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                view === 'list' ? 'bg-surface-container-lowest shadow-sm text-on-surface' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              List
            </button>
            <button
              onClick={() => setView('kanban')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                view === 'kanban' ? 'bg-surface-container-lowest shadow-sm text-on-surface' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Kanban
            </button>
          </div>
          <Button onClick={openNewRepairSheet}>
            <Plus className="h-4 w-4" />
            New Repair
          </Button>
        </div>
      </div>

      {/* Filters — only shown in list view */}
      {view === 'list' && (
        <div className="flex gap-3">
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
            options={STATUS_OPTIONS}
            value={statusFilter}
            onValueChange={setStatusFilter}
            placeholder="All Statuses"
            className="w-40"
          />
        </div>
      )}

      {/* List or Kanban */}
      {view === 'list' ? (
        <DataTable
          data={repairs}
          columns={columns}
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

      {/* New Repair Sheet */}
      <InlineFormSheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setSelectedCustomer(null); setSelectedAsset(null) }}
        title="New Repair Job"
        description="Create a new repair booking"
      >
        <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
          {/* Customer */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Customer</label>
            <CustomerSearch
              value={selectedCustomer}
              onChange={(c) => {
                setSelectedCustomer(c)
                if (!c) setSelectedAsset(null)
              }}
            />
          </div>

          {/* Customer's saved devices — only shown when customer is selected */}
          {selectedCustomer && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Customer Device
                <span className="ml-1.5 text-xs font-normal text-gray-400">select a saved device or skip</span>
              </label>
              <AssetPicker
                customerId={selectedCustomer.id}
                selected={selectedAsset}
                onSelect={(asset) => {
                  setSelectedAsset(asset)
                  if (asset) {
                    setValue('device_brand', asset.brand ?? '')
                    setValue('device_model', asset.model ?? '')
                    setValue('serial_number', asset.serial_number ?? '')
                  }
                }}
              />
            </div>
          )}

          <hr className="border-gray-100" />

          <ServiceSelector
            onSelect={(sel) => {
              if (sel) {
                // Only auto-fill device fields if no customer asset is linked
                if (!selectedAsset) {
                  setValue('device_type', sel.categoryName)
                  setValue('device_brand', sel.manufacturerName)
                  setValue('device_model', sel.deviceName)
                }
                setValue('issue', sel.problemName)
                setValue('estimated_cost', sel.price > 0 ? sel.price : undefined)
              }
            }}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Device Type" placeholder="Phone, Laptop..." {...register('device_type')} />
            <Input label="Brand" placeholder="Apple, Samsung..." {...register('device_brand')} />
          </div>
          <Input label="Model" placeholder="iPhone 15, Galaxy S24..." {...register('device_model')} />
          <Input label="Serial Number" placeholder="Optional" {...register('serial_number')} />

          <hr className="border-gray-100" />

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Issue Description <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              placeholder="Describe the problem..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              {...register('issue')}
            />
            {errors.issue && <p className="mt-1 text-xs text-red-600">{errors.issue.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Estimated Cost (£)"
              type="number"
              step="0.01"
              placeholder="0.00"
              {...register('estimated_cost', { valueAsNumber: true })}
            />
            <Input
              label="Deposit Paid (£)"
              type="number"
              step="0.01"
              placeholder="0.00"
              {...register('deposit_paid', { valueAsNumber: true })}
            />
          </div>

          <Button type="submit" className="w-full" loading={isSubmitting}>
            Create Repair Job
          </Button>
        </form>
      </InlineFormSheet>

      {/* Non-blocking email prompt */}
      {emailPrompt && (
        <RepairEmailPrompt
          repairId={emailPrompt.repairId}
          jobNumber={emailPrompt.jobNumber}
          onClose={() => setEmailPrompt(null)}
        />
      )}
    </div>
  )
}
