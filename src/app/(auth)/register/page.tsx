'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle, Building2, User, CreditCard, Check, Zap, Mail, ChevronRight, ArrowLeft } from 'lucide-react'

// â”€â”€ Schemas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Plans â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 'Â£29',
    period: '/mo',
    desc: 'Perfect for single-location repair shops just getting started.',
    features: ['1 branch', 'Up to 3 staff accounts', 'POS & Repairs', 'Basic inventory', 'Email support'],
    highlight: false,
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 'Â£79',
    period: '/mo',
    desc: 'For growing shops that need more power and team features.',
    features: ['Up to 3 branches', 'Unlimited staff', 'All 18 modules', 'Advanced reports', 'Priority support'],
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    desc: 'For chains and franchises that need full control and SLA guarantees.',
    features: ['Unlimited branches', 'Dedicated onboarding', 'Custom integrations', 'SLA 99.9% uptime', 'Dedicated account manager'],
    highlight: false,
  },
]

const STEPS = [
  { label: 'Business', icon: Building2 },
  { label: 'Account',  icon: User },
  { label: 'Plan',     icon: CreditCard },
]

// â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null)
  const [step2Data, setStep2Data] = useState<Step2Data | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null)
  const [checkingSubdomain, setCheckingSubdomain] = useState(false)
  const [serverError, setServerError] = useState('')
  const [proceeding, setProceeding] = useState(false)

  const form1 = useForm<Step1Data>({ resolver: zodResolver(step1Schema) })
  const form2 = useForm<Step2Data>({ resolver: zodResolver(step2Schema) })

  async function checkSubdomain(value: string) {
    if (value.length < 2) return
    setCheckingSubdomain(true)
    const res = await fetch(`/api/auth/check-subdomain?subdomain=${encodeURIComponent(value)}`)
    const json = await res.json()
    setSubdomainAvailable(json.data?.available ?? false)
    setCheckingSubdomain(false)
  }

  function onStep1Submit(data: Step1Data) {
    if (!subdomainAvailable) return
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
      // 1. Create the inactive account
      const regRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...step1Data, ...step2Data, planId: selectedPlan }),
      })
      const regJson = await regRes.json()
      if (!regRes.ok || regJson.error) {
        setServerError(regJson.error?.message ?? 'Registration failed. Please try again.')
        setProceeding(false)
        return
      }

      const businessId = regJson.data?.businessId
      if (!businessId) {
        setServerError('Unexpected error â€” please try again.')
        setProceeding(false)
        return
      }

      // 2. Create Stripe Checkout session
      const checkoutRes = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlan, businessId, email: step1Data.email }),
      })
      const checkoutJson = await checkoutRes.json()

      if (!checkoutRes.ok || checkoutJson.error) {
        setServerError(checkoutJson.error?.message ?? 'Failed to start checkout. Please try again.')
        setProceeding(false)
        return
      }

      // 3. Redirect to Stripe Checkout
      window.location.href = checkoutJson.data.url
    } catch {
      setServerError('Something went wrong. Please try again.')
      setProceeding(false)
    }
  }

  async function handleEnterpriseContact() {
    if (!step1Data || !step2Data) return
    setProceeding(true)
    // Create inactive account and send enterprise enquiry email
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

  return (
    <div className="space-y-4 w-full max-w-2xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-1">
        {STEPS.map(({ label, icon: Icon }, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              i < step  ? 'bg-green-100 text-green-700' :
              i === step ? 'bg-brand-teal text-white shadow-sm' :
                          'bg-gray-100 text-gray-400'
            }`}>
              {i < step
                ? <CheckCircle className="h-3.5 w-3.5" />
                : <Icon className="h-3.5 w-3.5" />
              }
              {label}
            </div>
            {i < STEPS.length - 1 && <div className="w-5 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* â”€â”€ Step 1: Business Info â”€â”€ */}
      {step === 0 && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={form1.handleSubmit(onStep1Submit)} className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Tell us about your business</h2>
                <p className="text-sm text-gray-500 mt-0.5">Set up your repair shop on RepairBooking</p>
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
                    subdomainAvailable === true  ? 'text-green-600' :
                    subdomainAvailable === false ? 'text-red-600'   : 'text-gray-400'
                  }`}>
                    {checkingSubdomain          ? 'Checking availabilityâ€¦'    :
                     subdomainAvailable === true  ? 'âœ“ Available â€” your URL will be: ' + (form1.watch('subdomain') || '') + '.repairbooking.co.uk' :
                     subdomainAvailable === false ? 'âœ— Already taken â€” try another' :
                     'Your URL: [subdomain].repairbooking.co.uk'}
                  </p>
                )}
              </div>

              <Input
                label="Business email"
                type="email"
                placeholder="hello@techfix.com"
                error={form1.formState.errors.email?.message}
                {...form1.register('email')}
              />

              <Input
                label="Phone number"
                type="tel"
                placeholder="+44 7700 900000"
                {...form1.register('phone')}
              />

              <Button type="submit" className="w-full" disabled={subdomainAvailable !== true || checkingSubdomain}>
                Continue <ChevronRight className="h-4 w-4" />
              </Button>

              <p className="text-center text-sm text-gray-500">
                Already have an account?{' '}
                <Link href="/login" className="text-brand-teal hover:underline font-medium">Sign in</Link>
              </p>
            </form>
          </CardContent>
        </Card>
      )}

      {/* â”€â”€ Step 2: Account Setup â”€â”€ */}
      {step === 1 && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={form2.handleSubmit(onStep2Submit)} className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Create your account</h2>
                <p className="text-sm text-gray-500 mt-0.5">You'll use these credentials to log in</p>
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
                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                error={form2.formState.errors.password?.message}
                {...form2.register('password')}
              />

              <Input
                label="Confirm password"
                type="password"
                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
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
      )}

      {/* â”€â”€ Step 3: Choose Plan â”€â”€ */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-900">Choose your plan</h2>
            <p className="text-sm text-gray-500 mt-1">14-day free trial on all paid plans. Cancel anytime.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANS.map(plan => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlan(plan.id)}
                className={`relative flex flex-col rounded-2xl border-2 p-5 text-left transition-all ${
                  selectedPlan === plan.id
                    ? 'border-brand-teal shadow-lg shadow-brand-teal/10'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                } ${plan.highlight ? 'bg-brand-teal text-white' : 'bg-white'}`}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-yellow px-3 py-0.5 text-xs font-black text-gray-900 whitespace-nowrap">
                    Most popular
                  </span>
                )}
                {selectedPlan === plan.id && (
                  <div className="absolute top-3 right-3">
                    <CheckCircle className="h-5 w-5 text-brand-teal" />
                  </div>
                )}
                <p className={`text-xs font-semibold uppercase tracking-widest mb-1 ${plan.highlight ? 'text-white/70' : 'text-gray-400'}`}>
                  {plan.name}
                </p>
                <div className="flex items-end gap-1 mb-3">
                  <span className={`text-3xl font-black ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>{plan.price}</span>
                  {plan.period && <span className={`text-sm mb-1 ${plan.highlight ? 'text-white/70' : 'text-gray-400'}`}>{plan.period}</span>}
                </div>
                <p className={`text-xs mb-4 leading-relaxed ${plan.highlight ? 'text-white/80' : 'text-gray-500'}`}>{plan.desc}</p>
                <ul className="space-y-2">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs">
                      <Check className={`h-3.5 w-3.5 shrink-0 ${plan.highlight ? 'text-white' : 'text-brand-teal'}`} />
                      <span className={plan.highlight ? 'text-white/90' : 'text-gray-700'}>{f}</span>
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>

          {serverError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{serverError}</div>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>

            {selectedPlan === 'enterprise' ? (
              <Button
                className="flex-1"
                loading={proceeding}
                onClick={handleEnterpriseContact}
              >
                <Mail className="h-4 w-4" /> Contact sales team
              </Button>
            ) : (
              <Button
                className="flex-1"
                loading={proceeding}
                disabled={!selectedPlan}
                onClick={handleProceedToPayment}
              >
                <Zap className="h-4 w-4" />
                {selectedPlan ? `Start free trial â€” ${PLANS.find(p => p.id === selectedPlan)?.price}/mo` : 'Select a plan to continue'}
              </Button>
            )}
          </div>

          <p className="text-center text-xs text-gray-400">
            Secure payment via Stripe Â· No credit card charged until trial ends
          </p>
        </div>
      )}
    </div>
  )
}
