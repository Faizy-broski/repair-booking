'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Zap, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth.store'
import { createClient } from '@/lib/supabase/client'
import {
  CustomPlanCard,
  deriveCustomPlanBaseline,
  makeDefaultCustomPlanState,
  toCustomPlanPayload,
  type CustomPlanState,
} from '@/components/landing/custom-plan-card'

interface Plan {
  id: string
  name: string
  price_monthly: number
  price_yearly: number | null
  plan_type: 'free' | 'paid' | 'enterprise'
  features: string[] | null
  max_branches: number | null
  max_users: number | null
  limits?: Record<string, number | boolean | null> | null
}

function parseFeatures(features: string[] | null): string[] {
  if (!features) return []
  if (Array.isArray(features)) return features
  try { return JSON.parse(features as unknown as string) } catch { return [] }
}

export default function PlansPage() {
  const router = useRouter()
  const { subscriptionStatus } = useAuthStore()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [customPlan, setCustomPlan] = useState<CustomPlanState | null>(null)
  const [customEditable, setCustomEditable] = useState(false) // trialing, is_custom, no stripe_sub_id yet
  const [savingCustom, setSavingCustom] = useState(false)
  const [upgradingCustom, setUpgradingCustom] = useState(false)
  const { profile } = useAuthStore()
  const customPlanBaseline = deriveCustomPlanBaseline(plans)
  const effectiveCustomPlan = customPlan ?? makeDefaultCustomPlanState(customPlanBaseline)

  useEffect(() => {
    fetch('/api/plans')
      .then((r) => r.json())
      .then(({ data }) => {
        const subscribable = (data ?? []).filter((p: Plan) => p.plan_type !== 'enterprise')
        setPlans(subscribable)
      })
      .finally(() => setLoading(false))
  }, [])

  // Check whether this business is already on a trial-time-editable custom plan.
  useEffect(() => {
    if (!profile?.business_id) return
    const supabase = createClient()
    // Cast: is_custom/custom_* columns exist post-migration-111 but aren't in the
    // generated database types yet — regenerate types after applying that migration
    // to remove this cast.
    ;(supabase as any)
      .from('subscriptions')
      .select('is_custom, status, stripe_sub_id, custom_max_branches, custom_max_users, custom_max_products, custom_max_services')
      .eq('business_id', profile.business_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }: { data: {
        is_custom: boolean
        status: string
        stripe_sub_id: string | null
        custom_max_branches: number | null
        custom_max_users: number | null
        custom_max_products: number | null
        custom_max_services: number | null
      } | null }) => {
        if (data?.is_custom && data.status === 'trialing' && !data.stripe_sub_id) {
          setCustomEditable(true)
          setCustomPlan({
            branches: data.custom_max_branches ?? customPlanBaseline.baseBranches,
            staff: data.custom_max_users ?? customPlanBaseline.baseStaff,
            inventoryLimit: data.custom_max_products ?? customPlanBaseline.baseInventory,
            inventoryUnlimited: data.custom_max_products === null,
            repairLimit: data.custom_max_services ?? customPlanBaseline.baseRepair,
            repairUnlimited: data.custom_max_services === null,
          })
        }
      })
  }, [profile?.business_id])

  async function handleSaveCustomTrial() {
    setSavingCustom(true)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/account/custom-plan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toCustomPlanPayload(effectiveCustomPlan)),
      })
      const json = await res.json()
      if (!res.ok) setErrorMsg(json.error ?? 'Something went wrong')
    } catch {
      setErrorMsg('Network error — please try again')
    } finally {
      setSavingCustom(false)
    }
  }

  async function handleUpgradeCustom() {
    setUpgradingCustom(true)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/stripe/upgrade-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toCustomPlanPayload(effectiveCustomPlan)),
      })
      const json = await res.json()
      if (!res.ok) setErrorMsg(json.error?.message ?? 'Something went wrong')
      else router.push(json.data.url)
    } catch {
      setErrorMsg('Network error — please try again')
    } finally {
      setUpgradingCustom(false)
    }
  }

  async function handleSelect(planId: string) {
    setUpgrading(planId)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/stripe/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, billingCycle }),
      })
      const json = await res.json()
      if (!res.ok) setErrorMsg(json.error?.message ?? json.error ?? 'Something went wrong')
      else router.push(json.data.url)
    } catch {
      setErrorMsg('Network error — please try again')
    } finally {
      setUpgrading(null)
    }
  }

  const midIndex = plans.length >= 2 ? Math.floor(plans.length / 2) : -1

  return (
    <div className="min-h-screen bg-surface px-4 py-10">
      <div className="mx-auto max-w-5xl">

        {/* Back */}
        <button
          onClick={() => router.push('/account')}
          className="mb-6 flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Account
        </button>

        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black text-on-surface mb-2">Choose your plan</h1>
          <p className="text-on-surface-variant">
            {subscriptionStatus && !subscriptionStatus.hasAccess
              ? 'Your subscription has ended — resubscribe to restore full access.'
              : 'Upgrade or switch to a plan that fits your business.'}
          </p>
        </div>

        {/* Billing cycle toggle */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-low p-1">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={cn(
                'rounded-full px-6 py-2 text-sm font-semibold transition-all',
                billingCycle === 'monthly'
                  ? 'bg-brand-teal text-white shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={cn(
                'flex items-center gap-2 rounded-full px-6 py-2 text-sm font-semibold transition-all',
                billingCycle === 'yearly'
                  ? 'bg-brand-teal text-white shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              )}
            >
              Annual
              <span className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-bold',
                billingCycle === 'yearly' ? 'bg-white/20 text-white' : 'bg-green-100 text-green-700'
              )}>
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {errorMsg && (
          <p className="mb-6 text-center text-sm text-red-400 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
            {errorMsg}
          </p>
        )}

        {/* Plan cards */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-brand-teal" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((p, i) => {
              const highlighted = i === midIndex
              const showYearly = billingCycle === 'yearly' && !!p.price_yearly
              const displayPrice = showYearly ? p.price_yearly! : p.price_monthly
              const priceSuffix = showYearly ? '/yr' : '/mo'
              const savings = p.price_yearly ? (p.price_monthly * 12) - p.price_yearly : 0

              return (
                <div
                  key={p.id}
                  className={cn(
                    'relative flex flex-col rounded-2xl border p-6 transition-all',
                    highlighted
                      ? 'border-brand-teal bg-brand-teal/10 shadow-lg scale-[1.02]'
                      : 'border-outline-variant bg-surface-container-lowest'
                  )}
                >
                  {highlighted && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-teal px-3 py-0.5 text-[11px] font-bold text-white shadow">
                      Most popular
                    </span>
                  )}

                  <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">{p.name}</p>

                  <div className="flex items-end gap-1 mb-1">
                    <span className="text-4xl font-black text-on-surface">£{displayPrice}</span>
                    <span className="text-sm text-on-surface-variant mb-1">{priceSuffix}</span>
                  </div>

                  {showYearly ? (
                    <p className="text-xs text-green-600 font-semibold mb-4">
                      saves £{savings}/yr vs monthly
                    </p>
                  ) : (
                    <p className="text-xs text-on-surface-variant mb-4">Billed monthly</p>
                  )}

                  <ul className="flex-1 space-y-2 mb-6">
                    {parseFeatures(p.features).map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-on-surface-variant">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-teal" />
                        <span className="capitalize">{f.replace(/_/g, ' ')}</span>
                      </li>
                    ))}
                    {p.max_branches != null && (
                      <li className="flex items-center gap-2 text-sm text-on-surface-variant">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-teal" />
                        {p.max_branches} branch{p.max_branches !== 1 ? 'es' : ''}
                      </li>
                    )}
                    {p.max_users != null && (
                      <li className="flex items-center gap-2 text-sm text-on-surface-variant">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-teal" />
                        Up to {p.max_users} staff members
                      </li>
                    )}
                  </ul>

                  <Button
                    onClick={() => handleSelect(p.id)}
                    disabled={!!upgrading}
                    className={cn(
                      'w-full font-semibold gap-2',
                      highlighted
                        ? 'bg-brand-teal text-white hover:bg-brand-teal/90'
                        : 'bg-surface-container-highest text-on-surface hover:bg-surface-container-high'
                    )}
                  >
                    {upgrading === p.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <><Zap className="h-4 w-4" /> Get started</>
                    }
                  </Button>
                </div>
              )
            })}
            <CustomPlanCard
              state={effectiveCustomPlan}
              onChange={setCustomPlan}
              baseline={customPlanBaseline}
              ctaLabel={
                customEditable
                  ? (savingCustom ? 'Saving…' : 'Save changes')
                  : (upgradingCustom ? 'Upgrading…' : 'Get started')
              }
              onCtaClick={customEditable ? handleSaveCustomTrial : handleUpgradeCustom}
              disabled={customEditable ? savingCustom : upgradingCustom}
            />
          </div>
        )}
        {customEditable && (
          <p className="mt-4 text-center text-xs text-on-surface-variant">
            You're on a trial Custom Plan — adjust it freely until your trial ends.
          </p>
        )}

        <p className="mt-8 text-center text-xs text-on-surface-variant">
          All plans include a 30-day free trial. Cancel anytime. Prices shown exclude VAT.
        </p>
      </div>
    </div>
  )
}
