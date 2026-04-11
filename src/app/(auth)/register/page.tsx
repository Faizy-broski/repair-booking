'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle, Building2, User, CreditCard, Check, Zap, Mail, ChevronRight, ArrowLeft, Sparkles } from 'lucide-react'

// Schemas
const step1Schema = z.object({
  businessName:   z.string().min(2, 'Business name is required'),
  subdomain:      z.string().min(2).max(30).regex(/^[a-z0-9-]+$/, { message: 'Only lowercase letters, numbers, and hyphens' }),
  email:          z.string().email('Invalid email'),
  phone:          z.string().optional(),
})

const step2Schema = z.object({
  fullName:       z.string().min(2, 'Full name is required'),
  password:       z.string().min(8, 'Minimum 8 characters'),
  confirmPassword:z.string(),
  mainBranchName: z.string().min(2, 'Branch name is required'),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match', path: ['confirmPassword'],
})

type Step1Data = z.infer<typeof step1Schema>
type Step2Data = z.infer<typeof step2Schema>

interface DbPlan {
  id: string
  name: string
  price_monthly: number
  max_branches: number
  max_users: number
  features: string[]
  stripe_price_id_monthly: string | null
  plan_type: 'free' | 'paid' | 'enterprise'
}

const FEATURE_LABELS: Record<string, string> = {
  pos:            'Point of Sale',
  inventory:      'Inventory management',
  repairs:        'Repair ticketing',
  reports:        'Reports & analytics',
  messaging:      'Customer messaging',
  appointments:   'Appointment booking',
  expenses:       'Expense tracking',
  employees:      'Employee management',
  gift_cards:     'Gift cards',
  google_reviews: 'Google review requests',
  phone:          'VoIP phone',
  custom_fields:  'Custom fields',
}

function formatFeature(key: string): string {
  return FEATURE_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function isPlanHighlighted(plans: DbPlan[], index: number): boolean {
  return plans.length >= 2 && index === Math.floor(plans.length / 2)
}

const STEPS = [
  { label: 'Business', icon: Building2 },
  { label: 'Account',  icon: User },
  { label: 'Plan',     icon: CreditCard },
]

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null)
  const [step2Data, setStep2Data] = useState<Step2Data | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<DbPlan | null>(null)
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null)
  const [checkingSubdomain, setCheckingSubdomain] = useState(false)
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null)
  const [checkingEmail, setCheckingEmail] = useState(false)
  const [serverError, setServerError] = useState('')
  const [proceeding, setProceeding] = useState(false)
  const [plans, setPlans] = useState<DbPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(false)

  const form1 = useForm<Step1Data>({ resolver: zodResolver(step1Schema) })
  const form2 = useForm<Step2Data>({ resolver: zodResolver(step2Schema) })

  useEffect(() => {
    if (step === 2 && plans.length === 0) {
      setPlansLoading(true)
      fetch('/api/plans')
        .then(r => r.json())
        .then(j => { if (j.data) setPlans(j.data) })
        .catch(() => {})
        .finally(() => setPlansLoading(false))
    }
  }, [step, plans.length])

  const isFreePlan = selectedPlan?.plan_type === 'free'
  const isEnterprisePlan = selectedPlan?.plan_type === 'enterprise'

  async function checkSubdomain(value: string) {
    if (value.length < 2) return
    setCheckingSubdomain(true)
    const res = await fetch(`/api/auth/check-subdomain?subdomain=${encodeURIComponent(value)}`)
    const json = await res.json()
    setSubdomainAvailable(json.data?.available ?? false)
    setCheckingSubdomain(false)
  }

  async function checkEmail(value: string) {
    if (!value.includes('@')) return
    setCheckingEmail(true)
    setEmailAvailable(null)
    try {
      const res = await fetch(`/api/auth/check-email?email=${encodeURIComponent(value)}`)
      const json = await res.json()
      setEmailAvailable(json.data?.available ?? false)
    } catch {
      setEmailAvailable(null)
    }
    setCheckingEmail(false)
  }

  function onStep1Submit(data: Step1Data) {
    if (!subdomainAvailable) return
    if (emailAvailable === false) return
    setStep1Data(data)
    setStep(1)
  }

  function onStep2Submit(data: Step2Data) {
    setStep2Data(data)
    setStep(2)
  }

  async function handleProceedToPayment() {
    if (!step1Data || !step2Data || !selectedPlan) return
    setServerError('')
    setProceeding(true)
    try {
      if (isFreePlan) {
        // Free plan: create account immediately, no Stripe
        const regRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...step1Data, ...step2Data, planId: selectedPlan.id }),
        })
        const regJson = await regRes.json()
        if (!regRes.ok || regJson.error) {
          setServerError(regJson.error?.message ?? 'Registration failed. Please try again.')
          setProceeding(false)
          return
        }
        // Redirect to their subdomain dashboard
        const subdomain = step1Data.subdomain.toLowerCase()
        const host = window.location.hostname
        const port = window.location.port
        const base = host === 'localhost' ? `http://${subdomain}.localhost${port ? ':' + port : ''}` : `https://${subdomain}.${host.split('.').slice(-2).join('.')}`
        window.location.href = `${base}/dashboard`
        return
      }

      // Paid plan: create Stripe checkout — account created by webhook after payment
      const checkoutRes = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...step1Data, ...step2Data, planId: selectedPlan.id }),
      })
      const checkoutJson = await checkoutRes.json()
      if (!checkoutRes.ok || checkoutJson.error) {
        setServerError(checkoutJson.error?.message ?? 'Failed to start checkout. Please try again.')
        setProceeding(false)
        return
      }
      window.location.href = checkoutJson.data.url
    } catch {
      setServerError('Something went wrong. Please try again.')
      setProceeding(false)
    }
  }

  async function handleEnterpriseContact() {
    if (!step1Data || !step2Data) return
    setProceeding(true)
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...step1Data, ...step2Data, planId: 'enterprise' }),
    })
    if (res.ok) {
      router.push('/register/enterprise-success')
    } else {
      const j = await res.json()
      setServerError(j.error?.message ?? 'Something went wrong.')
    }
    setProceeding(false)
  }

  // isEnterprise / isFree defined above with useEffect

  return (
    <div className="w-full">
      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-center gap-1">
        {STEPS.map(({ label, icon: Icon }, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              i < step   ? 'bg-primary-container text-on-primary-container' :
              i === step ? 'bg-primary text-on-primary shadow-sm shadow-primary/30' :
                           'bg-surface-container-high text-on-surface-variant'
            }`}>
              {i < step ? <CheckCircle className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              {label}
            </div>
            {i < STEPS.length - 1 && <div className="w-5 h-px bg-outline-variant" />}
          </div>
        ))}
      </div>

      {/* Step 1: Business Info */}
      {step === 0 && (
        <div className="mx-auto max-w-md">
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={form1.handleSubmit(onStep1Submit)} className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-on-surface">Tell us about your business</h2>
                  <p className="text-sm text-on-surface-variant mt-0.5">Set up your repair shop on RepairBooking</p>
                </div>
                <Input
                  label="Business name"
                  placeholder="Tech Fix Ltd"
                  error={form1.formState.errors.businessName?.message}
                  {...form1.register('businessName')}
                />
                <div>
                  <Input
                    label="Your subdomain"
                    placeholder="techfix"
                    error={form1.formState.errors.subdomain?.message}
                    {...form1.register('subdomain', { onChange: e => checkSubdomain(e.target.value) })}
                  />
                  {!form1.formState.errors.subdomain && (
                    <p className={`mt-1 text-xs ${
                      subdomainAvailable === true  ? 'text-primary' :
                      subdomainAvailable === false ? 'text-error'   : 'text-on-surface-variant'
                    }`}>
                      {checkingSubdomain
                        ? 'Checking availability\u2026'
                        : subdomainAvailable === true
                          ? '\u2713 Available \u2014 your URL will be: ' + (form1.watch('subdomain') || '') + '.repairbooking.co.uk'
                          : subdomainAvailable === false
                            ? '\u2717 Already taken \u2014 try another'
                            : 'Your URL: [subdomain].repairbooking.co.uk'}
                    </p>
                  )}
                </div>
                <div>
                  <Input
                    label="Business email"
                    type="email"
                    placeholder="hello@techfix.com"
                    error={form1.formState.errors.email?.message}
                    {...form1.register('email', {
                      onChange: () => { if (emailAvailable === false) setEmailAvailable(null) },
                      onBlur: e => checkEmail(e.target.value),
                    })}
                  />
                  {!form1.formState.errors.email && (
                    <p className={`mt-1 text-xs ${
                      emailAvailable === false ? 'text-error' :
                      checkingEmail            ? 'text-on-surface-variant' : ''
                    }`}>
                      {checkingEmail
                        ? 'Checking\u2026'
                        : emailAvailable === false
                          ? '\u2717 An account with this email already exists. Please sign in instead.'
                          : null}
                    </p>
                  )}
                </div>
                <Input
                  label="Phone number"
                  type="tel"
                  placeholder="+44 7700 900000"
                  {...form1.register('phone')}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={subdomainAvailable !== true || checkingSubdomain || emailAvailable === false || checkingEmail}
                >
                  Continue <ChevronRight className="h-4 w-4" />
                </Button>
                <p className="text-center text-sm text-on-surface-variant">
                  Already have an account?{' '}
                  <Link href="/login" className="text-primary hover:underline font-medium">Sign in</Link>
                </p>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 2: Account Setup */}
      {step === 1 && (
        <div className="mx-auto max-w-md">
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={form2.handleSubmit(onStep2Submit)} className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-on-surface">Create your account</h2>
                  <p className="text-sm text-on-surface-variant mt-0.5">{"You'll use these credentials to log in"}</p>
                </div>
                <Input
                  label="Your full name"
                  placeholder="John Smith"
                  error={form2.formState.errors.fullName?.message}
                  {...form2.register('fullName')}
                />
                <Input
                  label="Password"
                  type="password"
                  placeholder="Password"
                  error={form2.formState.errors.password?.message}
                  {...form2.register('password')}
                />
                <Input
                  label="Confirm password"
                  type="password"
                  placeholder="Confirm password"
                  error={form2.formState.errors.confirmPassword?.message}
                  {...form2.register('confirmPassword')}
                />
                <Input
                  label="Main branch name"
                  placeholder="Main Store"
                  error={form2.formState.errors.mainBranchName?.message}
                  {...form2.register('mainBranchName')}
                />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(0)}>
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button type="submit" className="flex-1" loading={form2.formState.isSubmitting}>
                    Continue <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 3: Choose Plan */}
      {step === 2 && (
        <div className="space-y-10">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-on-surface">Choose your plan</h2>
            <p className="text-on-surface-variant mt-1">14-day free trial on all paid plans. Cancel anytime.</p>
          </div>

          {plansLoading ? (
            <div className="flex items-center justify-center py-20 text-on-surface-variant">Loading plans...</div>
          ) : (
            <div className={`grid gap-8 items-stretch ${
              plans.length === 3 ? 'grid-cols-1 md:grid-cols-3' :
              plans.length === 2 ? 'grid-cols-1 md:grid-cols-2 max-w-3xl mx-auto' :
              'max-w-sm mx-auto'
            }`}>
              {plans.map((plan, index) => {
                const highlighted = isPlanHighlighted(plans, index)
                const isSelected = selectedPlan?.id === plan.id
                const isFree = plan.plan_type === 'free'
                const isEnterprise = plan.plan_type === 'enterprise'

                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan)}
                    className={`relative flex flex-col rounded-3xl border-2 p-8 text-left transition-all duration-200 ${
                      highlighted
                        ? 'bg-primary text-on-primary border-transparent shadow-2xl shadow-primary/30 scale-[1.04]'
                        : isSelected
                          ? 'bg-surface-container-lowest border-primary shadow-xl shadow-primary/10'
                          : 'bg-surface-container-lowest border-outline-variant/50 hover:border-primary/40 hover:shadow-lg'
                    }`}
                  >
                    {/* Popular badge */}
                    {highlighted && (
                      <span className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-brand-yellow px-4 py-1.5 text-xs font-black text-gray-900 whitespace-nowrap shadow-lg">
                        <Sparkles className="h-3 w-3" /> Most popular
                      </span>
                    )}

                    {/* Selected tick */}
                    {isSelected && !highlighted && (
                      <span className="absolute top-5 right-5">
                        <CheckCircle className="h-5 w-5 text-brand-teal" />
                      </span>
                    )}

                    {/* Plan label */}
                    <p className={`text-[11px] font-bold uppercase tracking-[0.15em] mb-4 ${highlighted ? 'text-on-primary/60' : 'text-on-surface-variant'}`}>
                      {plan.name}
                    </p>

                    {/* Price */}
                    <div className="flex items-end gap-1 mb-2">
                      {isFree ? (
                        <span className={`text-5xl font-black leading-none ${highlighted ? 'text-on-primary' : 'text-on-surface'}`}>Free</span>
                      ) : isEnterprise ? (
                        <span className={`text-5xl font-black leading-none ${highlighted ? 'text-on-primary' : 'text-on-surface'}`}>Custom</span>
                      ) : (
                        <>
                          <span className={`text-5xl font-black leading-none ${highlighted ? 'text-on-primary' : 'text-on-surface'}`}>
                            &pound;{plan.price_monthly % 1 === 0 ? plan.price_monthly : plan.price_monthly.toFixed(2)}
                          </span>
                          <span className={`text-base mb-1.5 ${highlighted ? 'text-on-primary/60' : 'text-on-surface-variant'}`}>/mo</span>
                        </>
                      )}
                    </div>
                    {!isFree && !isEnterprise && (
                      <p className={`text-xs mb-6 ${highlighted ? 'text-on-primary/50' : 'text-on-surface-variant'}`}>Billed monthly, cancel anytime</p>
                    )}
                    {isFree && (
                      <p className={`text-xs mb-6 font-medium ${highlighted ? 'text-on-primary/70' : 'text-primary'}`}>30-day free trial &mdash; no credit card needed</p>
                    )}
                    {isEnterprise && (
                      <p className={`text-xs mb-6 ${highlighted ? 'text-on-primary/50' : 'text-on-surface-variant'}`}>Tailored quote for your business</p>
                    )}

                    {/* Limits pills */}
                    <div className={`flex gap-3 mb-6 pb-6 border-b ${highlighted ? 'border-on-primary/20' : 'border-outline-variant/30'}`}>
                      <div className={`flex-1 text-center rounded-xl py-2.5 ${highlighted ? 'bg-on-primary/10' : 'bg-surface-container'}`}>
                        <p className={`text-xl font-bold ${highlighted ? 'text-on-primary' : 'text-on-surface'}`}>
                          {plan.max_branches >= 50 ? '\u221e' : plan.max_branches}
                        </p>
                        <p className={`text-[10px] uppercase tracking-wide mt-0.5 ${highlighted ? 'text-on-primary/50' : 'text-on-surface-variant'}`}>Branches</p>
                      </div>
                      <div className={`flex-1 text-center rounded-xl py-2.5 ${highlighted ? 'bg-on-primary/10' : 'bg-surface-container'}`}>
                        <p className={`text-xl font-bold ${highlighted ? 'text-on-primary' : 'text-on-surface'}`}>
                          {plan.max_users >= 999 ? '\u221e' : plan.max_users}
                        </p>
                        <p className={`text-[10px] uppercase tracking-wide mt-0.5 ${highlighted ? 'text-on-primary/50' : 'text-on-surface-variant'}`}>Staff</p>
                      </div>
                    </div>

                    {/* Features */}
                    <ul className="space-y-3 flex-1">
                      {(Array.isArray(plan.features) ? plan.features : []).map((f: string) => (
                        <li key={f} className="flex items-start gap-3 text-sm">
                          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${highlighted ? 'bg-on-primary/15' : 'bg-primary/10'}`}>
                            <Check className={`h-3 w-3 ${highlighted ? 'text-brand-yellow' : 'text-primary'}`} />
                          </span>
                          <span className={highlighted ? 'text-on-primary/90' : 'text-on-surface'}>{formatFeature(f)}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA row */}
                    <div className={`mt-8 pt-6 border-t ${highlighted ? 'border-on-primary/20' : 'border-outline-variant/30'}`}>
                      <div className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-all ${
                        isSelected
                          ? highlighted ? 'bg-on-primary/25 text-on-primary' : 'bg-primary text-on-primary'
                          : highlighted ? 'bg-on-primary/10 text-on-primary/80 hover:bg-on-primary/20' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                      }`}>
                        {isSelected
                          ? <><CheckCircle className="h-4 w-4" /> Selected</>
                          : isFree ? 'Start free \u2014 no card needed' : isEnterprise ? 'Contact sales' : 'Select this plan'}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {serverError && (
            <div className="mx-auto max-w-md rounded-lg border border-error-container/40 bg-error-container/15 px-4 py-3 text-sm text-on-error-container">{serverError}</div>
          )}

          <div className="flex items-center gap-3 max-w-sm mx-auto">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {isEnterprisePlan ? (
              <Button className="flex-1" loading={proceeding} onClick={handleEnterpriseContact}>
                <Mail className="h-4 w-4" /> Contact sales team
              </Button>
            ) : (
              <Button className="flex-1" loading={proceeding} disabled={!selectedPlan} onClick={handleProceedToPayment}>
                <Zap className="h-4 w-4" />
                {selectedPlan
                  ? isFreePlan
                    ? 'Start 30-day free trial'
                    : `Start free trial — £${selectedPlan.price_monthly % 1 === 0 ? selectedPlan.price_monthly : selectedPlan.price_monthly.toFixed(2)}/mo`
                  : 'Select a plan to continue'}
              </Button>
            )}
          </div>

          <p className="text-center text-xs text-on-surface-variant">
            Secure payment via Stripe &middot; No credit card charged until trial ends
          </p>
        </div>
      )}
    </div>
  )
}