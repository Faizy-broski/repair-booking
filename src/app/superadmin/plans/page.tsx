'use client'
import { useState, useEffect } from 'react'
import { Plus, Edit2, Check, X, Shield, Gauge } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { InlineFormSheet } from '@/components/shared/inline-form-sheet'
import { formatCurrency } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import { PLAN_LIMIT_KEYS, type PlanLimits } from '@/types/module-config'

interface PlanRow {
  id: string
  name: string
  price_monthly: number
  price_yearly: number
  max_branches: number
  max_users: number
  is_active: boolean
  features: Record<string, boolean>
  limits: PlanLimits
}

const schema = z.object({
  name: z.string().min(1),
  price_monthly: z.coerce.number().min(0),
  price_yearly: z.coerce.number().min(0),
  max_branches: z.coerce.number().int().positive(),
  max_users: z.coerce.number().int().positive(),
  stripe_price_id_monthly: z.string().optional(),
  stripe_price_id_yearly: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const ALL_FEATURES = [
  'pos', 'inventory', 'repairs', 'customers', 'appointments', 'expenses',
  'employees', 'reports', 'messages', 'invoices', 'gift_cards', 'google_reviews', 'phone',
]

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editPlan, setEditPlan] = useState<PlanRow | null>(null)
  const [features, setFeatures] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_FEATURES.map((f) => [f, true]))
  )
  const [limits, setLimits] = useState<PlanLimits>({})
  const [tab, setTab] = useState<'general' | 'features' | 'limits'>('general')

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    async function fetchPlans() {
      setLoading(true)
      const res = await fetch('/api/plans')
      const json = await res.json()
      setPlans(json.data ?? [])
      setLoading(false)
    }
    fetchPlans()
  }, [])

  function openCreate() {
    setEditPlan(null)
    reset()
    setFeatures(Object.fromEntries(ALL_FEATURES.map((f) => [f, true])))
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
    })
    setFeatures(plan.features ?? {})
    setLimits(plan.limits ?? {})
    setTab('general')
    setSheetOpen(true)
  }

  async function onSubmit(data: FormData) {
    const payload = { ...data, features, limits }
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
      if (editPlan) {
        setPlans((p) => p.map((x) => x.id === editPlan.id ? json.data : x))
      } else {
        setPlans((p) => [...p, json.data])
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
          <p className="text-sm text-gray-500">Manage subscription tiers</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Plan
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                  <p className="text-2xl font-bold text-blue-600 mt-1">
                    {formatCurrency(plan.price_monthly)}<span className="text-sm font-normal text-gray-400">/mo</span>
                  </p>
                  <p className="text-sm text-gray-400">{formatCurrency(plan.price_yearly)}/yr</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={plan.is_active ? 'success' : 'destructive'}>
                    {plan.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(plan)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-sm text-gray-500">
                <p>Up to {plan.max_branches} branches</p>
                <p>Up to {plan.max_users} users</p>
                {Object.entries(plan.limits ?? {}).filter(([, v]) => typeof v === 'boolean' && v).length > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <Shield className="h-3 w-3 text-green-500" />
                    <span className="text-xs text-green-600">
                      {Object.entries(plan.limits ?? {}).filter(([, v]) => v === true).length} premium features
                    </span>
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {Object.entries(plan.features ?? {}).filter(([, v]) => v).slice(0, 5).map(([k]) => (
                  <span key={k} className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 capitalize">
                    {k.replace('_', ' ')}
                  </span>
                ))}
                {Object.values(plan.features ?? {}).filter(Boolean).length > 5 && (
                  <span className="text-[10px] text-gray-400">+{Object.values(plan.features ?? {}).filter(Boolean).length - 5} more</span>
                )}
              </div>
            </div>
          ))}
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
                {t === 'general' ? 'General' : t === 'features' ? 'Features' : 'Limits'}
              </button>
            ))}
          </div>

          {tab === 'general' && (
            <div className="space-y-4">
              <Input label="Plan Name" required error={errors.name?.message} {...register('name')} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Monthly Price (£)" type="number" step="0.01" required error={errors.price_monthly?.message} {...register('price_monthly')} />
                <Input label="Yearly Price (£)" type="number" step="0.01" required {...register('price_yearly')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Max Branches" type="number" required {...register('max_branches')} />
                <Input label="Max Users" type="number" required {...register('max_users')} />
              </div>
              <Input label="Stripe Monthly Price ID" placeholder="price_..." {...register('stripe_price_id_monthly')} />
              <Input label="Stripe Yearly Price ID" placeholder="price_..." {...register('stripe_price_id_yearly')} />
            </div>
          )}

          {tab === 'features' && (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Enabled Modules</label>
              <div className="grid grid-cols-2 gap-1.5">
                {ALL_FEATURES.map((feat) => (
                  <label key={feat} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={features[feat] ?? false}
                      onChange={(e) => setFeatures((f) => ({ ...f, [feat]: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="capitalize">{feat.replace('_', ' ')}</span>
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
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Resource Limits</h4>
                {PLAN_LIMIT_KEYS.filter((l) => l.type === 'number').map((lk) => (
                  <Input
                    key={lk.key}
                    label={lk.label}
                    type="number"
                    value={(limits[lk.key] as number) ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const val = e.target.value
                      setLimits((l) => ({
                        ...l,
                        [lk.key]: val === '' ? undefined : Number(val),
                      }))
                    }}
                    placeholder="Unlimited"
                  />
                ))}
              </div>
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Premium Features</h4>
                <div className="grid grid-cols-2 gap-1.5">
                  {PLAN_LIMIT_KEYS.filter((l) => l.type === 'boolean').map((lk) => (
                    <label key={lk.key} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(limits[lk.key] as boolean) ?? false}
                        onChange={(e) => setLimits((l) => ({ ...l, [lk.key]: e.target.checked }))}
                        className="rounded"
                      />
                      <span>{lk.label}</span>
                    </label>
                  ))}
                </div>
              </div>
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
