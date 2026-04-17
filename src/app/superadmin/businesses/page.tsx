'use client'
import { useState, useEffect, useCallback } from 'react'
import { Search, ShieldAlert, ShieldCheck, Settings2, CheckCircle2, XCircle, Minus, Eye } from 'lucide-react'
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

interface BusinessRow {
  id: string
  name: string
  subdomain: string
  email: string | null
  is_active: boolean
  created_at: string
  subscriptions?: Array<{ status: string; plans?: { name: string; features: string[] } | null }> | null
}

/** Shape returned by GET /api/admin/businesses/[id]/modules */
interface ModuleSummaryRow {
  module: string
  is_enabled: boolean   // resolved (plan + overrides)
  access: {
    is_enabled: boolean
    plan_override: boolean | null  // null = respect plan, true = force-grant, false = force-deny
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
      // Refresh
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
        {/* Plan info header */}
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
                  {/* Status icon */}
                  {resolvedEnabled
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                    : <XCircle className="h-4 w-4 shrink-0 text-gray-300" />
                  }

                  {/* Module name + plan membership */}
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

                  {/* Override controls */}
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

// ── Main businesses page ──────────────────────────────────────────────────────

export default function BusinessesPage() {
  const router = useRouter()
  const [businesses, setBusinesses] = useState<BusinessRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [modulesBusiness, setModulesBusiness] = useState<BusinessRow | null>(null)

  useEffect(() => {
    async function fetch_() {
      setLoading(true)
      const params = new URLSearchParams({ page: String(page + 1), limit: '20' })
      if (search) params.set('search', search)
      const res = await fetch(`/api/businesses?${params}`)
      const json = await res.json()
      setBusinesses(json.data ?? [])
      setTotal(json.meta?.total ?? 0)
      setLoading(false)
    }
    fetch_()
  }, [page, search])

  async function toggleSuspend(biz: BusinessRow) {
    const suspending = biz.is_active
    // Always update BOTH fields atomically so middleware checks stay consistent:
    //   is_active=false + is_suspended=true  → blocked
    //   is_active=true  + is_suspended=false → allowed
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
          <p className="font-medium text-gray-900">{getValue() as string}</p>
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
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => router.push(`/superadmin/businesses/${row.original.id}`)}
            title="View full business details"
            className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
          >
            <Eye className="h-3.5 w-3.5 mr-1" /> View Details
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setModulesBusiness(row.original)}
            title="Manage module access"
          >
            <Settings2 className="h-3.5 w-3.5 mr-1" /> Modules
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => toggleSuspend(row.original)}
            className={row.original.is_active ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-700'}
          >
            {row.original.is_active ? (
              <><ShieldAlert className="h-3.5 w-3.5" /> Suspend</>
            ) : (
              <><ShieldCheck className="h-3.5 w-3.5" /> Activate</>
            )}
          </Button>
        </div>
      ),
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
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          placeholder="Search businesses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <DataTable
        data={businesses}
        columns={columns}
        isLoading={loading}
        totalCount={total}
        pageIndex={page}
        pageSize={20}
        onPageChange={setPage}
        emptyMessage="No businesses found."
      />

      {/* Per-business module management sheet */}
      <ModuleSheet
        business={modulesBusiness}
        open={modulesBusiness !== null}
        onClose={() => setModulesBusiness(null)}
      />
    </div>
  )
}
