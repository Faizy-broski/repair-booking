'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, Zap, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { Button } from '@/components/ui/button'
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
  max_branches: number | null
  max_users: number | null
  features: string[] | null
  limits?: Record<string, number | boolean | null> | null
  plan_type?: string
  stripe_price_id_monthly: string | null
}

interface Subscription {
  status: string
  trial_ends_at: string | null
}

function daysLeft(isoDate: string): number {
  const diff = new Date(isoDate).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export default function UpgradePage() {
  const { profile } = useAuthStore()
  const router = useRouter()

  const [plans, setPlans] = useState<Plan[]>([])
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [customPlan, setCustomPlan] = useState<CustomPlanState | null>(null)
  const [upgradingCustom, setUpgradingCustom] = useState(false)
  const customPlanBaseline = deriveCustomPlanBaseline(plans)
  const effectiveCustomPlan = customPlan ?? makeDefaultCustomPlanState(customPlanBaseline)

  useEffect(() => {
    async function load() {
      // Fetch paid plans
      const res = await fetch('/api/plans')
      const json = await res.json()
      const paid: Plan[] = ((json.data ?? []) as (Plan & { plan_type?: string })[]).filter(
        (p) => p.plan_type === 'paid'
      )
      setPlans(paid)

      // Fetch current subscription
      if (profile?.business_id) {
        const supabase = createClient()
        const { data } = await supabase
          .from('subscriptions')
          .select('status, trial_ends_at')
          .eq('business_id', profile.business_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        setSubscription(data as Subscription | null)
      }

      setLoading(false)
    }
    load()
  }, [profile?.business_id])

  async function handleUpgrade(planId: string) {
    setUpgrading(planId)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/stripe/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })
      const json = await res.json()
      if (!res.ok) {
        setErrorMsg(json.error ?? 'Something went wrong')
      } else {
        router.push(json.data.url)
      }
    } catch {
      setErrorMsg('Network error — please try again')
    } finally {
      setUpgrading(null)
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
      if (!res.ok) {
        setErrorMsg(json.error?.message ?? 'Something went wrong')
      } else {
        router.push(json.data.url)
      }
    } catch {
      setErrorMsg('Network error — please try again')
    } finally {
      setUpgradingCustom(false)
    }
  }

  const trialDays = subscription?.trial_ends_at ? daysLeft(subscription.trial_ends_at) : 0
  const isTrialing = subscription?.status === 'trialing'
  const isExpired = isTrialing && trialDays <= 0

  return (
    <div className="min-h-screen bg-surface-container-low flex flex-col items-center justify-start py-16 px-4">
      {/* Banner */}
      <div className={`w-full max-w-3xl rounded-2xl px-6 py-5 mb-10 text-center ${isExpired ? 'bg-red-500/5 border border-red-500/20' : 'bg-amber-500/5 border border-amber-500/20'}`}>
        <Zap className={`h-6 w-6 mx-auto mb-2 ${isExpired ? 'text-red-500' : 'text-amber-500'}`} />
        {isExpired ? (
          <>
            <p className="text-lg font-semibold text-red-600">Your free trial has ended</p>
            <p className="text-sm text-red-600 mt-1">Upgrade now to continue using your account.</p>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-amber-700">
              {isTrialing
                ? trialDays > 0 ? `${trialDays} day${trialDays === 1 ? '' : 's'} left in your free trial` : 'Your trial is ending soon'
                : 'Choose your plan'}
            </p>
            <p className="text-sm text-amber-700 mt-1">
              {isTrialing ? 'Upgrade now to keep uninterrupted access.' : 'Pick a plan and complete payment to use your account.'}
            </p>
          </>
        )}
      </div>

      <h1 className="text-3xl font-semibold tracking-tight text-on-surface mb-2 text-center">Choose your plan</h1>
      <p className="text-on-surface-variant text-sm mb-10 text-center">No hidden fees. Cancel anytime.</p>

      {errorMsg && (
        <div className="w-full max-w-3xl mb-6 bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3 text-red-600 text-sm text-center">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-6xl">
          {plans.map((plan, index) => {
            const highlighted = plans.length >= 2 && index === Math.floor(plans.length / 2)
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border p-6 transition-colors ${
                  highlighted
                    ? 'border-primary bg-surface-container-lowest text-on-surface ring-1 ring-primary/20'
                    : 'border-outline-variant bg-surface-container-lowest text-on-surface'
                }`}
              >
                {highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary/10 px-3 py-0.5 text-[11px] font-semibold text-primary">
                    Most popular
                  </span>
                )}
                <p className="mb-2 text-sm font-semibold text-primary">
                  {plan.name}
                </p>
                <div className="flex items-end gap-1 mb-2">
                  <span className="text-5xl font-semibold leading-none tabular-nums tracking-tight text-on-surface">
                    &pound;{plan.price_monthly}
                  </span>
                  <span className="mb-1 text-base text-on-surface-variant">/mo</span>
                </div>
                <p className="mb-6 text-xs text-on-surface-variant">Billed monthly, cancel anytime</p>

                {/* Stats */}
                <div className="flex gap-2 mb-6">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${highlighted ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                    {plan.max_branches != null ? plan.max_branches : '\u221e'} {plan.max_branches === 1 ? 'branch' : 'branches'}
                  </span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${highlighted ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                    {plan.max_users != null ? plan.max_users : '\u221e'} staff
                  </span>
                </div>

                {/* Features */}
                <ul className="flex-1 space-y-2 mb-8">
                  {(plan.features ?? []).map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <CheckCircle className={`h-4 w-4 shrink-0 ${highlighted ? 'text-primary' : 'text-emerald-600'}`} />
                      <span className="capitalize text-on-surface-variant">{f.replace(/_/g, ' ')}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={upgrading === plan.id}
                  className={`w-full font-semibold py-3 rounded-xl ${
                    highlighted
                      ? 'bg-primary text-on-primary hover:bg-primary/90'
                      : 'bg-surface-container-highest text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  {upgrading === plan.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  ) : (
                    'Upgrade now'
                  )}
                </Button>
              </div>
            )
          })}
          <CustomPlanCard
            state={effectiveCustomPlan}
            onChange={setCustomPlan}
            baseline={customPlanBaseline}
            variant="light"
            ctaLabel={upgradingCustom ? 'Upgrading…' : 'Upgrade now'}
            onCtaClick={handleUpgradeCustom}
            disabled={upgradingCustom}
          />
        </div>
      )}
    </div>
  )
}
