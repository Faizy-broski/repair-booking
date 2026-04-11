'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, Zap, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

interface Plan {
  id: string
  name: string
  price_monthly: number
  max_branches: number | null
  max_users: number | null
  features: string[] | null
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

  const trialDays = subscription?.trial_ends_at ? daysLeft(subscription.trial_ends_at) : 0
  const isExpired = subscription?.status === 'trialing' && trialDays <= 0

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start py-16 px-4">
      {/* Banner */}
      <div className={`w-full max-w-3xl rounded-2xl px-6 py-5 mb-10 text-center ${isExpired ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`}>
        <Zap className={`h-6 w-6 mx-auto mb-2 ${isExpired ? 'text-red-500' : 'text-amber-500'}`} />
        {isExpired ? (
          <>
            <p className="text-lg font-bold text-red-700">Your free trial has ended</p>
            <p className="text-sm text-red-600 mt-1">Upgrade now to continue using your account.</p>
          </>
        ) : (
          <>
            <p className="text-lg font-bold text-amber-800">
              {trialDays > 0 ? `${trialDays} day${trialDays === 1 ? '' : 's'} left in your free trial` : 'Your trial is ending soon'}
            </p>
            <p className="text-sm text-amber-700 mt-1">Upgrade now to keep uninterrupted access.</p>
          </>
        )}
      </div>

      <h1 className="text-3xl font-black text-gray-900 mb-2 text-center">Choose your plan</h1>
      <p className="text-gray-500 text-sm mb-10 text-center">No hidden fees. Cancel anytime.</p>

      {errorMsg && (
        <div className="w-full max-w-3xl mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm text-center">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl">
          {plans.map((plan, index) => {
            const highlighted = plans.length >= 2 && index === Math.floor(plans.length / 2)
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-3xl p-8 shadow-lg transition-transform ${
                  highlighted
                    ? 'bg-indigo-600 text-white scale-[1.04]'
                    : 'bg-white text-gray-900'
                }`}
              >
                {highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-gray-900 text-xs font-bold px-3 py-1 rounded-full shadow">
                    Most popular
                  </span>
                )}
                <p className={`text-sm font-semibold uppercase tracking-widest mb-2 ${highlighted ? 'text-indigo-200' : 'text-indigo-500'}`}>
                  {plan.name}
                </p>
                <div className="flex items-end gap-1 mb-2">
                  <span className={`text-5xl font-black leading-none ${highlighted ? 'text-white' : 'text-gray-900'}`}>
                    &pound;{plan.price_monthly}
                  </span>
                  <span className={`text-base mb-1 ${highlighted ? 'text-indigo-200' : 'text-gray-400'}`}>/mo</span>
                </div>
                <p className={`text-xs mb-6 ${highlighted ? 'text-indigo-200' : 'text-gray-400'}`}>Billed monthly, cancel anytime</p>

                {/* Stats */}
                <div className="flex gap-2 mb-6">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${highlighted ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {plan.max_branches != null ? plan.max_branches : '\u221e'} {plan.max_branches === 1 ? 'branch' : 'branches'}
                  </span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${highlighted ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {plan.max_users != null ? plan.max_users : '\u221e'} staff
                  </span>
                </div>

                {/* Features */}
                <ul className="flex-1 space-y-2 mb-8">
                  {(plan.features ?? []).map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <CheckCircle className={`h-4 w-4 shrink-0 ${highlighted ? 'text-indigo-200' : 'text-green-500'}`} />
                      <span className={`capitalize ${highlighted ? 'text-white' : 'text-gray-700'}`}>{f.replace(/_/g, ' ')}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={upgrading === plan.id}
                  className={`w-full font-bold py-3 rounded-xl ${
                    highlighted
                      ? 'bg-white text-indigo-700 hover:bg-indigo-50'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
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
        </div>
      )}
    </div>
  )
}
