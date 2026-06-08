'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, ShieldAlert, ShieldCheck, Settings2, CheckCircle2, XCircle, Minus, Eye, Trash2, MoreVertical, Users, Wrench, Package, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/shared/data-table'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { formatDate } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'
import { MODULES } from '@/backend/config/constants'
import { useRouter } from 'next/navigation'

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
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

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
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
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
        </div>
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

// ── Main businesses page ──────────────────────────────────────────────────────

export default function BusinessesPage() {
  const router = useRouter()
  const [businesses, setBusinesses] = useState<BusinessRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [modulesBusiness, setModulesBusiness] = useState<BusinessRow | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    async function fetch_() {
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: String(page + 1), limit: String(pageSize) })
        if (search) params.set('search', search)
        const res = await fetch(`/api/businesses?${params}`, { signal: controller.signal })
        const json = await res.json()
        setBusinesses(json.data ?? [])
        setTotal(json.meta?.total ?? 0)
      } catch (e: any) {
        if (e?.name !== 'AbortError') throw e
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    fetch_()
    return () => controller.abort()
  }, [page, search, pageSize])

  async function deleteBusiness(id: string) {
    setDeleting(true)
    try {
      await fetch(`/api/businesses/${id}`, { method: 'DELETE' })
      setBusinesses((b) => b.filter((x) => x.id !== id))
      setTotal((t) => t - 1)
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
    setBusinesses((b) =>
      b.map((x) =>
        x.id === biz.id ? { ...x, is_active: !suspending } : x
      )
    )
  }

  const columns: ColumnDef<BusinessRow>[] = [
    {
      accessorKey: 'name',
      header: 'Business',
      cell: ({ getValue, row }) => (
        <div>
          <button
            onClick={() => router.push(`/superadmin/businesses/${row.original.id}`)}
            className="font-medium text-teal-700 hover:text-teal-900 hover:underline text-left"
          >
            {getValue() as string}
          </button>
          <p className="text-xs text-gray-400 font-mono">{row.original.subdomain}.repairbooking.co.uk</p>
        </div>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ getValue }) => (getValue() as string) || '—',
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Businesses</h1>
          <p className="text-sm text-gray-500">{total} registered businesses</p>
        </div>
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
