'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Search, ShieldAlert, ShieldCheck, Settings2, CheckCircle2, XCircle, Minus, Eye, Trash2, MoreVertical, Users, Wrench, Package, X, Download, ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/shared/data-table'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { formatDate } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'
import { MODULES } from '@/backend/config/constants'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'

const MODULE_LABELS: Record<string, string> = {
  pos:            'POS',
  inventory:      'Inventory',
  repairs:        'Repairs',
  customers:      'Customers',
  appointments:   'Appointments',
  expenses:       'Expenses',
  employees:      'Employees',
  reports:        'Reports',
  messages:       'Messages',
  invoices:       'Invoices',
  gift_cards:     'Gift Cards',
  google_reviews: 'Google Reviews',
  phone:          'Phone',
}

interface BusinessStats {
  salesRevenue: number
  repairRevenue: number
  repairs: number
  inventory: number
  customers: number
}

interface BusinessRow {
  id: string
  name: string
  subdomain: string
  email: string | null
  owner_name: string | null
  is_active: boolean
  created_at: string
  subscriptions?: Array<{
    status: string
    current_period_end: string | null
    trial_ends_at: string | null
    plans?: { name: string; features: string[] } | null
  }> | null
  stats?: BusinessStats
}

/** Shape returned by GET /api/admin/businesses/[id]/modules */
interface ModuleSummaryRow {
  module: string
  is_enabled: boolean
  access: {
    is_enabled: boolean
    plan_override: boolean | null
    template_name: string | null
  } | null
  has_override: boolean
}

// ── Override badge helpers ────────────────────────────────────────────────────

function OverrideLabel({ override }: { override: boolean | null }) {
  if (override === true)  return <span className="text-[10px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Force ON</span>
  if (override === false) return <span className="text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Force OFF</span>
  return <span className="text-[10px] text-gray-400">Plan default</span>
}

// ── 3-dot action menu ─────────────────────────────────────────────────────────

function ActionMenu({
  biz,
  onViewDetails,
  onModules,
  onToggleSuspend,
  onDelete,
}: {
  biz: BusinessRow
  onViewDetails: () => void
  onModules: () => void
  onToggleSuspend: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function toggle() {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + window.scrollY + 4, left: r.right + window.scrollX - 176 })
    setOpen((v) => !v)
  }

  const item = (label: string, icon: React.ReactNode, onClick: () => void, danger = false) => (
    <button
      onClick={() => { onClick(); setOpen(false) }}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 ${danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700'}`}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div>
      <button
        ref={btnRef}
        onClick={toggle}
        className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'absolute', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {item('View Details', <Eye className="h-3.5 w-3.5" />, onViewDetails)}
          {item('Modules', <Settings2 className="h-3.5 w-3.5" />, onModules)}
          {item(
            biz.is_active ? 'Suspend' : 'Activate',
            biz.is_active
              ? <ShieldAlert className="h-3.5 w-3.5" />
              : <ShieldCheck className="h-3.5 w-3.5" />,
            onToggleSuspend,
            biz.is_active,
          )}
          <div className="my-1 border-t border-gray-100" />
          {item('Delete', <Trash2 className="h-3.5 w-3.5" />, onDelete, true)}
        </div>,
        document.body
      )}
    </div>
  )
}

// ── Per-business module management sheet ─────────────────────────────────────

function ModuleSheet({
  business,
  open,
  onClose,
}: {
  business: BusinessRow | null
  open: boolean
  onClose: () => void
}) {
  const [rows, setRows] = useState<ModuleSummaryRow[]>([])
  const [loadingModules, setLoadingModules] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  const planFeatures: string[] = business?.subscriptions?.[0]?.plans?.features ?? []

  const fetchModules = useCallback(async () => {
    if (!business) return
    setLoadingModules(true)
    try {
      const res = await fetch(`/api/admin/businesses/${business.id}/modules`)
      const json = await res.json()
      setRows(json.data ?? [])
    } finally {
      setLoadingModules(false)
    }
  }, [business])

  useEffect(() => {
    if (open && business) fetchModules()
  }, [open, business, fetchModules])

  async function setPlanOverride(module: string, value: boolean | null) {
    if (!business) return
    setSaving(module)
    try {
      await fetch(`/api/admin/businesses/${business.id}/modules/${module}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_override: value }),
      })
      await fetchModules()
    } finally {
      setSaving(null)
    }
  }

  const planName = business?.subscriptions?.[0]?.plans?.name ?? 'No plan'
  const subStatus = business?.subscriptions?.[0]?.status ?? null

  return (
    <InlineFormSheet
      open={open}
      onClose={onClose}
      title={`Module Access — ${business?.name ?? ''}`}
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">{planName}</p>
            <p className="text-xs text-gray-500">
              {planFeatures.length} modules included in plan
            </p>
          </div>
          {subStatus && (
            <Badge variant={
              subStatus === 'active' ? 'success' :
              subStatus === 'trialing' ? 'warning' : 'destructive'
            }>
              {subStatus}
            </Badge>
          )}
        </div>

        <p className="text-xs text-gray-500 leading-relaxed">
          <strong>Plan default</strong> respects the plan's module list.{' '}
          <strong>Force ON</strong> grants a module even if not in the plan.{' '}
          <strong>Force OFF</strong> blocks a module even if the plan includes it.
        </p>

        {loadingModules ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {[...MODULES].map((mod) => {
              const row = rows.find((r) => r.module === mod)
              const inPlan = planFeatures.includes(mod)
              const override = row?.access?.plan_override ?? null
              const resolvedEnabled = row?.is_enabled ?? false
              const isSaving = saving === mod

              return (
                <div
                  key={mod}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3"
                >
                  {resolvedEnabled
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                    : <XCircle className="h-4 w-4 shrink-0 text-gray-300" />
                  }

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{MODULE_LABELS[mod] ?? mod}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {inPlan
                        ? <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">In plan</span>
                        : <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Not in plan</span>
                      }
                      <OverrideLabel override={override} />
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      title="Force ON — grant regardless of plan"
                      disabled={isSaving}
                      onClick={() => setPlanOverride(mod, override === true ? null : true)}
                      className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs transition-colors disabled:opacity-50 ${
                        override === true
                          ? 'border-green-500 bg-green-500 text-white'
                          : 'border-gray-200 bg-white text-gray-400 hover:border-green-400 hover:text-green-600'
                      }`}
                    >
                      ✓
                    </button>
                    <button
                      title="Plan default"
                      disabled={isSaving}
                      onClick={() => setPlanOverride(mod, null)}
                      className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs transition-colors disabled:opacity-50 ${
                        override === null
                          ? 'border-gray-400 bg-gray-100 text-gray-600'
                          : 'border-gray-200 bg-white text-gray-300 hover:border-gray-400 hover:text-gray-500'
                      }`}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <button
                      title="Force OFF — deny regardless of plan"
                      disabled={isSaving}
                      onClick={() => setPlanOverride(mod, override === false ? null : false)}
                      className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs transition-colors disabled:opacity-50 ${
                        override === false
                          ? 'border-red-500 bg-red-500 text-white'
                          : 'border-gray-200 bg-white text-gray-400 hover:border-red-400 hover:text-red-600'
                      }`}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </InlineFormSheet>
  )
}

// ── Delete confirm inline widget ──────────────────────────────────────────────

function DeleteConfirm({ onConfirm, onCancel, deleting }: { onConfirm: () => void; onCancel: () => void; deleting: boolean }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1">
      <span className="text-xs font-medium text-red-700 whitespace-nowrap">Delete?</span>
      <button
        disabled={deleting}
        onClick={onConfirm}
        className="rounded px-2 py-0.5 text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
      >
        {deleting ? '…' : 'Yes'}
      </button>
      <button
        disabled={deleting}
        onClick={onCancel}
        className="rounded px-2 py-0.5 text-xs font-semibold bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        No
      </button>
    </div>
  )
}

// ── Stat pill ─────────────────────────────────────────────────────────────────

function StatPill({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <span title={label} className="inline-flex items-center gap-1 text-sm text-gray-700">
      <span className="text-gray-400">{icon}</span>
      {value.toLocaleString()}
    </span>
  )
}

// ── Export dropdown ───────────────────────────────────────────────────────────

function ExportMenu() {
  const [open, setOpen]         = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const btnRef  = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function download(endpoint: string, label: string) {
    setDownloading(label)
    setOpen(false)
    try {
      const res = await fetch(endpoint)
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      // Get filename from Content-Disposition header
      const cd   = res.headers.get('Content-Disposition') ?? ''
      const match = cd.match(/filename="([^"]+)"/)
      a.download  = match?.[1] ?? `${label}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed', err)
    } finally {
      setDownloading(null)
    }
  }

  const isDownloading = downloading !== null

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        disabled={isDownloading}
        className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-teal-700 active:bg-teal-800 transition-colors disabled:opacity-60 shadow-sm"
      >
        <Download className={`h-4 w-4 ${isDownloading ? 'animate-bounce' : ''}`} />
        {isDownloading ? `Exporting ${downloading}…` : 'Export'}
        {!isDownloading && <ChevronDown className="h-3.5 w-3.5 opacity-75" />}
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1.5 z-30 w-56 rounded-xl border border-gray-200 bg-white py-1.5 shadow-xl ring-1 ring-black/5"
        >
          <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Download as Excel
          </p>
          <button
            onClick={() => download('/api/admin/export/businesses', 'Businesses')}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Download className="h-4 w-4 text-teal-600" />
            <span>
              <span className="font-medium">Businesses</span>
              <span className="block text-xs text-gray-400">All businesses + stats</span>
            </span>
          </button>
          <button
            onClick={() => download('/api/admin/export/users', 'Users')}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Download className="h-4 w-4 text-violet-600" />
            <span>
              <span className="font-medium">Users</span>
              <span className="block text-xs text-gray-400">All staff across all businesses</span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main businesses page ──────────────────────────────────────────────────────

export default function BusinessesPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [modulesBusiness, setModulesBusiness] = useState<BusinessRow | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const queryKey = ['superadmin-businesses', page, pageSize, search]

  const { data, isLoading: loading } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page + 1), limit: String(pageSize) })
      if (search) params.set('search', search)
      const res = await fetch(`/api/businesses?${params}`)
      if (!res.ok) throw new Error('Failed to load businesses')
      return res.json()
    },
    placeholderData: (prev) => prev,
  })

  const businesses: BusinessRow[] = data?.data ?? []
  const total: number = data?.meta?.total ?? 0

  async function deleteBusiness(id: string) {
    setDeleting(true)
    try {
      await fetch(`/api/businesses/${id}`, { method: 'DELETE' })
      queryClient.invalidateQueries({ queryKey: ['superadmin-businesses'] })
    } finally {
      setDeleting(false)
      setConfirmDeleteId(null)
    }
  }

  async function toggleSuspend(biz: BusinessRow) {
    const suspending = biz.is_active
    await fetch(`/api/businesses/${biz.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        is_active:    !suspending,
        is_suspended:  suspending,
      }),
    })
    // Optimistic update in cache
    queryClient.setQueryData(queryKey, (old: any) => {
      if (!old) return old
      return {
        ...old,
        data: old.data.map((x: BusinessRow) =>
          x.id === biz.id ? { ...x, is_active: !suspending } : x
        ),
      }
    })
  }

  const columns: ColumnDef<BusinessRow>[] = [
    {
      accessorKey: 'name',
      header: 'Business',
      cell: ({ getValue, row }) => (
        <div>
          <Link
            href={`/superadmin/businesses/${row.original.id}`}
            className="font-medium text-teal-700 hover:text-teal-900 hover:underline text-left"
          >
            {getValue() as string}
          </Link>
          <p className="text-xs text-gray-400 font-mono">{row.original.subdomain}.repairbooking.co.uk</p>
        </div>
      ),
    },
    {
      accessorKey: 'owner_name',
      header: 'Owner',
      cell: ({ getValue, row }) => {
        const name = getValue() as string | null
        const email = row.original.email
        return name ? (
          <div>
            <p className="text-sm font-medium text-gray-800">{name}</p>
            {email && <p className="text-xs text-gray-400">{email}</p>}
          </div>
        ) : email ? (
          <p className="text-sm text-gray-600">{email}</p>
        ) : (
          <span className="text-gray-400 text-sm">—</span>
        )
      },
    },
    {
      accessorKey: 'subscriptions',
      header: 'Plan',
      cell: ({ getValue }) => {
        const subs = getValue() as BusinessRow['subscriptions']
        const sub = subs?.[0]
        return sub ? (
          <div>
            <p className="text-sm text-gray-700">{sub.plans?.name ?? '—'}</p>
            <Badge
              variant={
                sub.status === 'active' ? 'success' :
                sub.status === 'trialing' ? 'warning' : 'destructive'
              }
              className="text-[10px]"
            >
              {sub.status}
            </Badge>
          </div>
        ) : <span className="text-gray-400 text-sm">—</span>
      },
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ getValue }) => (
        <Badge variant={(getValue() as boolean) ? 'success' : 'destructive'}>
          {(getValue() as boolean) ? 'Active' : 'Suspended'}
        </Badge>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Joined',
      cell: ({ getValue }) => formatDate(getValue() as string),
    },
    {
      id: 'expiry',
      header: 'Expires',
      cell: ({ row }) => {
        const sub = row.original.subscriptions?.[0]
        if (!sub) return <span className="text-gray-400 text-sm">—</span>
        const date = sub.current_period_end ?? sub.trial_ends_at
        if (!date) return <span className="text-gray-400 text-sm">—</span>
        const expired = new Date(date) < new Date()
        return (
          <span className={`text-sm ${expired ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
            {formatDate(date)}
          </span>
        )
      },
    },
    {
      id: 'salesRevenue',
      header: 'Sales Rev.',
      cell: ({ row }) => {
        const v = row.original.stats?.salesRevenue ?? 0
        return (
          <span className="text-sm font-medium text-gray-800">
            £{v.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        )
      },
    },
    {
      id: 'repairRevenue',
      header: 'Repair Rev.',
      cell: ({ row }) => {
        const v = row.original.stats?.repairRevenue ?? 0
        return (
          <span className="text-sm font-medium text-gray-800">
            £{v.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        )
      },
    },
    {
      id: 'customers',
      header: 'Customers',
      cell: ({ row }) => (
        <StatPill icon={<Users className="h-3.5 w-3.5" />} value={row.original.stats?.customers ?? 0} label="Customers" />
      ),
    },
    {
      id: 'inventory',
      header: 'Inventory',
      cell: ({ row }) => (
        <StatPill icon={<Package className="h-3.5 w-3.5" />} value={row.original.stats?.inventory ?? 0} label="Inventory items" />
      ),
    },
    {
      id: 'repairs',
      header: 'Repairs',
      cell: ({ row }) => (
        <StatPill icon={<Wrench className="h-3.5 w-3.5" />} value={row.original.stats?.repairs ?? 0} label="Repairs" />
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const biz = row.original
        const isConfirming = confirmDeleteId === biz.id
        if (isConfirming) {
          return (
            <DeleteConfirm
              onConfirm={() => deleteBusiness(biz.id)}
              onCancel={() => setConfirmDeleteId(null)}
              deleting={deleting}
            />
          )
        }
        return (
          <ActionMenu
            biz={biz}
            onViewDetails={() => router.push(`/superadmin/businesses/${biz.id}`)}
            onModules={() => setModulesBusiness(biz)}
            onToggleSuspend={() => toggleSuspend(biz)}
            onDelete={() => setConfirmDeleteId(biz.id)}
          />
        )
      },
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Businesses</h1>
          <p className="text-sm text-gray-500">{total} registered businesses</p>
        </div>
        <ExportMenu />
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search businesses..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-8 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-colors"
        />
        {search && (
          <button
            onClick={() => { setSearch(''); setPage(0) }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <DataTable
        data={businesses}
        columns={columns}
        isLoading={loading}
        totalCount={total}
        pageIndex={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(0) }}
        emptyMessage="No businesses found."
      />

      <ModuleSheet
        business={modulesBusiness}
        open={modulesBusiness !== null}
        onClose={() => setModulesBusiness(null)}
      />
    </div>
  )
}
