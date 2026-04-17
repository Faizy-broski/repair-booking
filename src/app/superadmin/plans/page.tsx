'use client'
import { useState, useEffect } from 'react'
import { Plus, Edit2, Shield, Gauge } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { formatCurrency } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import { PLAN_LIMIT_KEYS, type PlanLimits } from '@/types/module-config'
import { MODULES } from '@/backend/config/constants'

// Canonical module names — must match DB enum in resolve_module_config
const ALL_MODULES = [...MODULES] as string[]

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
  notifications:  'Notifications',
}

interface PlanRow {
  id: string
  name: string
  price_monthly: number
  price_yearly: number
  max_branches: number
  max_users: number
  is_active: boolean
  // DB stores as JSON array of enabled module names e.g. ["pos","repairs"]
  features: string[]
  limits: PlanLimits
}

const schema = z.object({
  name: z.string().min(1),
  price_monthly: z.coerce.number().min(0),
  price_yearly: z.coerce.number().min(0),
  max_branches: z.coerce.number().int().positive(),
  max_users: z.coerce.number().int().positive(),  is_active: z.coerce.boolean().optional().default(true),  stripe_price_id_monthly: z.string().optional(),
  stripe_price_id_yearly: z.string().optional(),
})

type FormData = z.infer<typeof schema>

/** Convert DB string[] to checkbox state Record */
function arrayToRecord(arr: string[]): Record<string, boolean> {
  return Object.fromEntries(ALL_MODULES.map((m) => [m, arr.includes(m)]))
}

/** Convert checkbox state Record to string[] for the API */
function recordToArray(rec: Record<string, boolean>): string[] {
  return Object.entries(rec).filter(([, v]) => v).map(([k]) => k)
}

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editPlan, setEditPlan] = useState<PlanRow | null>(null)
  // Internal UI state — checkboxes keyed by module name
  const [features, setFeatures] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_MODULES.map((m) => [m, true]))
  )
  const [limits, setLimits] = useState<PlanLimits>({})
  const [tab, setTab] = useState<'general' | 'features' | 'limits'>('general')

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    async function fetchPlans() {
      setLoading(true)
      const res = await fetch('/api/plans?all=true')
      const json = await res.json()
      // Normalise: ensure features is always a string[]
      const rows = (json.data ?? []).map((p: any) => ({
        ...p,
        features: Array.isArray(p.features) ? p.features : [],
      }))
      setPlans(rows)
      setLoading(false)
    }
    fetchPlans()
  }, [])

  function openCreate() {
    setEditPlan(null)
    reset({ price_yearly: 0, max_branches: 1, max_users: 5, is_active: true })
    // Default: all modules enabled for new plans
    setFeatures(Object.fromEntries(ALL_MODULES.map((m) => [m, true])))
    setLimits({})
    setTab('general')
    setSheetOpen(true)
  }

  function openEdit(plan: PlanRow) {
    setEditPlan(plan)
    reset({
      name: plan.name,
      price_monthly: plan.price_monthly,
      price_yearly: plan.price_yearly,
      max_branches: plan.max_branches,
      max_users: plan.max_users,
      is_active: plan.is_active,
    })
    // Convert DB array → checkbox state
    setFeatures(arrayToRecord(plan.features ?? []))
    setLimits(plan.limits ?? {})
    setTab('general')
    setSheetOpen(true)
  }

  async function onSubmit(data: FormData) {
    // Convert checkbox state → string[] for the API (DB expects JSON array)
    const payload = { ...data, features: recordToArray(features), limits }
    const res = editPlan
      ? await fetch(`/api/plans/${editPlan.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

    if (res.ok) {
      const json = await res.json()
      const saved: PlanRow = {
        ...json.data,
        features: Array.isArray(json.data.features) ? json.data.features : [],
      }
      if (editPlan) {
        setPlans((p) => p.map((x) => x.id === editPlan.id ? saved : x))
      } else {
        setPlans((p) => [...p, saved])
      }
      setSheetOpen(false)
      reset()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plans</h1>
          <p className="text-sm text-gray-500">Manage subscription tiers and their module access</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Plan
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-2xl bg-surface-container-low" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-5">
          {plans.map((plan) => {
            const enabledModules = plan.features ?? []
            return (
              <div
                key={plan.id}
                className="group rounded-2xl border border-outline-variant/50 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Teal header stripe */}
                <div className="bg-primary px-5 py-4 flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-white text-base">{plan.name}</h3>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-3xl font-bold text-white">{formatCurrency(plan.price_monthly)}</span>
                      <span className="text-sm text-white/70">/mo</span>
                    </div>
                    <p className="text-xs text-white/60 mt-0.5">{formatCurrency(plan.price_yearly)}/yr</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 mt-0.5">
                    <Badge variant={plan.is_active ? 'success' : 'destructive'}>
                      {plan.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <button
                      onClick={() => openEdit(plan)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25 transition-colors"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div className="px-5 py-4 space-y-3">
                  {/* Limits */}
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1.5 text-on-surface-variant">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-container text-primary text-[10px] font-bold">
                        {plan.max_branches}
                      </span>
                      {plan.max_branches === 1 ? 'branch' : 'branches'}
                    </span>
                    <span className="flex items-center gap-1.5 text-on-surface-variant">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-container text-primary text-[10px] font-bold">
                        {plan.max_users > 99 ? '∞' : plan.max_users}
                      </span>
                      users
                    </span>
                    {Object.values(plan.limits ?? {}).some((v) => v === true) && (
                      <span className="flex items-center gap-1 text-green-600">
                        <Shield className="h-3 w-3" />
                        <span className="text-xs">{Object.values(plan.limits ?? {}).filter((v) => v === true).length} premium</span>
                      </span>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="border-t border-outline-variant/40" />

                  {/* Module badges */}
                  <div className="flex flex-wrap gap-1">
                    {enabledModules.slice(0, 6).map((mod) => (
                      <span
                        key={mod}
                        className="rounded-full bg-primary-container/60 px-2 py-0.5 text-[10px] font-medium text-on-primary-container"
                      >
                        {MODULE_LABELS[mod] ?? mod}
                      </span>
                    ))}
                    {enabledModules.length > 6 && (
                      <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] text-on-surface-variant">
                        +{enabledModules.length - 6} more
                      </span>
                    )}
                    {enabledModules.length === 0 && (
                      <span className="text-[10px] text-outline italic">No modules</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <InlineFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editPlan ? `Edit ${editPlan.name}` : 'New Plan'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {(['general', 'features', 'limits'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'general' ? 'General' : t === 'features' ? `Modules (${recordToArray(features).length})` : 'Limits'}
              </button>
            ))}
          </div>

          {tab === 'general' && (
            <div className="space-y-4">
              <Input label="Plan Name" required error={errors.name?.message} {...register('name')} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Monthly Price (£)" type="number" step="0.01" required error={errors.price_monthly?.message} {...register('price_monthly')} />
                <Input label="Yearly Price (£)" type="number" step="0.01" {...register('price_yearly')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Max Branches" type="number" required {...register('max_branches')} />
                <Input label="Max Users" type="number" required {...register('max_users')} />
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <input
                  type="checkbox"
                  id="plan-active"
                  {...register('is_active')}
                  className="h-4 w-4 rounded border-gray-300 text-brand-teal focus:ring-brand-teal"
                />
                <label htmlFor="plan-active" className="text-sm font-medium text-gray-700">
                  Active plan
                </label>
              </div>
              <Input label="Stripe Monthly Price ID (optional)" placeholder="price_..." {...register('stripe_price_id_monthly')} />
              <Input label="Stripe Yearly Price ID (optional)" placeholder="price_..." {...register('stripe_price_id_yearly')} />
            </div>
          )}

          {tab === 'features' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Enabled Modules</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:underline"
                    onClick={() => setFeatures(Object.fromEntries(ALL_MODULES.map((m) => [m, true])))}
                  >
                    All
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    className="text-xs text-gray-500 hover:underline"
                    onClick={() => setFeatures(Object.fromEntries(ALL_MODULES.map((m) => [m, false])))}
                  >
                    None
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Checked modules are accessible to businesses on this plan. The DB function enforces this at query time.
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {ALL_MODULES.map((mod) => (
                  <label key={mod} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={features[mod] ?? false}
                      onChange={(e) => setFeatures((f) => ({ ...f, [mod]: e.target.checked }))}
                      className="rounded accent-blue-600"
                    />
                    <span>{MODULE_LABELS[mod] ?? mod}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {tab === 'limits' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                Set resource limits and premium feature flags for this plan. Leave blank for unlimited.
              </p>
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1">
                  <Gauge className="h-3 w-3" /> Resource Limits
                </h4>
                {PLAN_LIMIT_KEYS.filter((l) => l.type === 'number').map((lk) => (
                  <Input
                    key={lk.key}
                    label={lk.label}
                    type="number"
                    min="0"
                    value={(limits[lk.key] as number) ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const val = e.target.value
                      const num = Number(val)
                      setLimits((l) => ({
                        ...l,
                        [lk.key]: val === '' ? undefined : num < 0 ? 0 : num,
                      }))
                    }}
                    placeholder="Unlimited"
                  />
                ))}
              </div>
              {/* <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1">
                  <Shield className="h-3 w-3" /> Premium Features
                </h4>
                <div className="grid grid-cols-2 gap-1.5">
                  {PLAN_LIMIT_KEYS.filter((l) => l.type === 'boolean').map((lk) => (
                    <label key={lk.key} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm text-gray-600 cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={(limits[lk.key] as boolean) ?? false}
                        onChange={(e) => setLimits((l) => ({ ...l, [lk.key]: e.target.checked }))}
                        className="rounded accent-blue-600"
                      />
                      <span>{lk.label}</span>
                    </label>
                  ))}
                </div>
              </div> */}
            </div>
          )}

          <Button type="submit" className="w-full" loading={isSubmitting}>
            {editPlan ? 'Update Plan' : 'Create Plan'}
          </Button>
        </form>
      </InlineFormSheet>
    </div>
  )
}
