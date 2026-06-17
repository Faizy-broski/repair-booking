'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import {
  Building2, User, CreditCard, ClipboardList, CheckCircle,
  ChevronRight, ArrowLeft, Copy, Check, Eye, EyeOff, Sparkles, Plus,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Card, CardContent } from '@/components/ui/card'

// ── Schemas ───────────────────────────────────────────────────────────────────

const step1Schema = z.object({
  businessName: z.string().min(2, 'Business name is required'),
  subdomain: z.string().min(2, 'Min 2 characters').max(30).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphens only'),
  email: z.string().email('Invalid email'),
  phone: z.string().min(5, 'Phone number is required'),
})

const step2Schema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  password: z.string().min(8, 'Minimum 8 characters'),
  mainBranchName: z.string().min(2, 'Branch name is required'),
})

type Step1Data = z.infer<typeof step1Schema>
type Step2Data = z.infer<typeof step2Schema>

// ── Types ─────────────────────────────────────────────────────────────────────

interface DbPlan {
  id: string
  name: string
  price_monthly: number
  price_yearly: number
  max_branches: number | null
  max_users: number | null
  features: string[]
  plan_type: 'free' | 'paid' | 'enterprise'
  is_active: boolean
}

interface OnboardResult {
  businessId: string
  subdomain: string
  loginUrl: string
}

// ── Steps config ──────────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Business Info', icon: Building2 },
  { label: 'Account Setup', icon: User },
  { label: 'Plan', icon: CreditCard },
  { label: 'Review', icon: ClipboardList },
]

const FEATURE_LABELS: Record<string, string> = {
  pos: 'Point of Sale', inventory: 'Inventory management', repairs: 'Repair ticketing',
  reports: 'Reports & analytics', messaging: 'Customer messaging',
  appointments: 'Appointment booking', expenses: 'Expense tracking',
  employees: 'Employee management', gift_cards: 'Gift cards',
  google_reviews: 'Google review requests', phone: 'VoIP phone',
  custom_fields: 'Custom fields',
}

function formatFeature(key: string): string {
  return FEATURE_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function generatePassword(): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lower = 'abcdefghijklmnopqrstuvwxyz'
  const digits = '0123456789'
  const symbols = '!@#$%&*'
  const all = upper + lower + digits + symbols
  const rand = (set: string) => set[Math.floor(Math.random() * set.length)]
  const chars = [rand(upper), rand(lower), rand(digits), rand(symbols)]
  for (let i = 0; i < 8; i++) chars.push(rand(all))
  return chars.sort(() => Math.random() - 0.5).join('')
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OnboardBusinessPage() {
  const [step, setStep] = useState(1)
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null)
  const [step2Data, setStep2Data] = useState<Step2Data | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<DbPlan | null>(null)
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')
  const [plans, setPlans] = useState<DbPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(false)

  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null)
  const [checkingSubdomain, setCheckingSubdomain] = useState(false)
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null)
  const [checkingEmail, setCheckingEmail] = useState(false)

  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')
  const [result, setResult] = useState<OnboardResult | null>(null)
  const [copied, setCopied] = useState(false)

  const subdomainTimer = useRef<NodeJS.Timeout | null>(null)

  const form1 = useForm<Step1Data>({ resolver: zodResolver(step1Schema) })
  const form2 = useForm<Step2Data>({ resolver: zodResolver(step2Schema) })

  // Fetch plans when reaching step 3
  useEffect(() => {
    if (step === 3 && plans.length === 0) {
      setPlansLoading(true)
      fetch('/api/plans')
        .then(r => r.json())
        .then(j => { if (j.data) setPlans(j.data) })
        .catch(() => {})
        .finally(() => setPlansLoading(false))
    }
  }, [step, plans.length])

  // ── Availability checks ───────────────────────────────────────────────────

  function checkSubdomain(value: string) {
    if (subdomainTimer.current) clearTimeout(subdomainTimer.current)
    if (value.length < 2) { setSubdomainAvailable(null); return }
    setCheckingSubdomain(true)
    subdomainTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-subdomain?subdomain=${encodeURIComponent(value)}`)
        const j = await res.json()
        setSubdomainAvailable(j.data?.available ?? false)
      } finally {
        setCheckingSubdomain(false)
      }
    }, 500)
  }

  async function checkEmail(value: string): Promise<boolean> {
    if (!value.includes('@')) return false
    setCheckingEmail(true)
    setEmailAvailable(null)
    try {
      const res = await fetch(`/api/auth/check-email?email=${encodeURIComponent(value)}`)
      const j = await res.json()
      const available = j.data?.available ?? false
      setEmailAvailable(available)
      return available
    } catch {
      setEmailAvailable(null)
      return false
    } finally {
      setCheckingEmail(false)
    }
  }

  // ── Step handlers ─────────────────────────────────────────────────────────

  async function onStep1Submit(data: Step1Data) {
    if (subdomainAvailable === false) {
      form1.setError('subdomain', { message: 'This subdomain is already taken' })
      return
    }
    if (subdomainAvailable === null) {
      await new Promise<void>(resolve => {
        if (subdomainTimer.current) clearTimeout(subdomainTimer.current)
        subdomainTimer.current = setTimeout(async () => {
          try {
            const res = await fetch(`/api/auth/check-subdomain?subdomain=${encodeURIComponent(data.subdomain)}`)
            const j = await res.json()
            setSubdomainAvailable(j.data?.available ?? false)
          } finally {
            setCheckingSubdomain(false)
            resolve()
          }
        }, 0)
      })
    }
    if (emailAvailable === false) {
      form1.setError('email', { message: 'An account with this email already exists' })
      return
    }
    if (emailAvailable === null) {
      const ok = await checkEmail(data.email)
      if (!ok) {
        form1.setError('email', { message: 'An account with this email already exists' })
        return
      }
    }
    setStep1Data(data)
    setStep(2)
  }

  function onStep2Submit(data: Step2Data) {
    setStep2Data(data)
    setStep(3)
  }

  async function handleSubmit() {
    if (!step1Data || !step2Data) return
    setSubmitting(true)
    setServerError('')
    try {
      const res = await fetch('/api/admin/businesses/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...step1Data,
          ...step2Data,
          planId: selectedPlan?.id,
          billingCycle: billing,
        }),
      })
      const j = await res.json()
      if (!res.ok) {
        setServerError(j.error?.message ?? 'Something went wrong. Please try again.')
        return
      }
      setResult(j.data)
    } catch {
      setServerError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleCopy() {
    if (!result) return
    navigator.clipboard.writeText(result.loginUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleReset() {
    setStep(1)
    setStep1Data(null)
    setStep2Data(null)
    setSelectedPlan(null)
    setBilling('monthly')
    setResult(null)
    setServerError('')
    setSubdomainAvailable(null)
    setEmailAvailable(null)
    form1.reset()
    form2.reset()
  }

  // ── Success state ─────────────────────────────────────────────────────────

  if (result) {
    return (
      <div className="mx-auto max-w-lg py-12">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-teal-50">
            <CheckCircle className="h-7 w-7 text-teal-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Business onboarded!</h2>
          <p className="mt-1 text-sm text-gray-500">
            <span className="font-medium text-gray-700">{step1Data?.businessName}</span> has been set up.
            A welcome email with login details has been sent to{' '}
            <span className="font-medium text-gray-700">{step1Data?.email}</span>.
          </p>

          <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="mb-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Login URL</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate text-sm text-gray-800">{result.loginUrl}</code>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors shrink-0"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-teal-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              href="/superadmin/businesses"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              View all businesses
            </Link>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Onboard another
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      {/* Header */}
      <div>
        <Link
          href="/superadmin/businesses"
          className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Businesses
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Onboard a Business</h1>
        <p className="text-sm text-gray-500">Create a new tenant account without email verification.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-1 flex-wrap">
        {STEPS.map(({ label, icon: Icon }, i) => {
          const n = i + 1
          return (
            <div key={i} className="flex items-center gap-1">
              <div className={[
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                n < step ? 'bg-teal-100 text-teal-700' :
                n === step ? 'bg-teal-600 text-white shadow-sm' :
                'bg-gray-100 text-gray-400',
              ].join(' ')}>
                {n < step ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                {label}
              </div>
              {i < STEPS.length - 1 && <div className="w-4 h-px bg-gray-200" />}
            </div>
          )
        })}
      </div>

      {/* ── Step 1: Business Info ─────────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={form1.handleSubmit(onStep1Submit)} className="space-y-4">
              {/* Business name */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Business Name</label>
                <Input
                  {...form1.register('businessName')}
                  placeholder="e.g. TechFix Ltd"
                  autoFocus
                />
                {form1.formState.errors.businessName && (
                  <p className="text-xs text-red-500">{form1.formState.errors.businessName.message}</p>
                )}
              </div>

              {/* Subdomain */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Subdomain</label>
                <div className="flex items-center gap-0">
                  <Input
                    {...form1.register('subdomain', {
                      onChange: e => {
                        const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                        form1.setValue('subdomain', v)
                        checkSubdomain(v)
                      },
                    })}
                    placeholder="techfix"
                    className="rounded-r-none border-r-0"
                  />
                  <span className="flex h-10 items-center rounded-r-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500 whitespace-nowrap">
                    .repairbooking.co.uk
                  </span>
                </div>
                {checkingSubdomain && <p className="text-xs text-gray-400">Checking availability…</p>}
                {!checkingSubdomain && subdomainAvailable === true && (
                  <p className="text-xs text-teal-600 flex items-center gap-1"><Check className="h-3 w-3" /> Available</p>
                )}
                {!checkingSubdomain && subdomainAvailable === false && (
                  <p className="text-xs text-red-500">This subdomain is already taken</p>
                )}
                {form1.formState.errors.subdomain && (
                  <p className="text-xs text-red-500">{form1.formState.errors.subdomain.message}</p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Business Email</label>
                <Input
                  {...form1.register('email', {
                    onBlur: e => checkEmail(e.target.value),
                  })}
                  type="email"
                  placeholder="owner@example.com"
                />
                {checkingEmail && <p className="text-xs text-gray-400">Checking…</p>}
                {!checkingEmail && emailAvailable === false && (
                  <p className="text-xs text-red-500">An account with this email already exists</p>
                )}
                {form1.formState.errors.email && (
                  <p className="text-xs text-red-500">{form1.formState.errors.email.message}</p>
                )}
              </div>

              {/* Phone */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Phone Number</label>
                <PhoneInput
                  value={form1.watch('phone') ?? ''}
                  onChange={v => form1.setValue('phone', v, { shouldValidate: true })}
                />
                {form1.formState.errors.phone && (
                  <p className="text-xs text-red-500">{form1.formState.errors.phone.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full">
                Continue <ChevronRight className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Account Setup ─────────────────────────────────────────── */}
      {step === 2 && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={form2.handleSubmit(onStep2Submit)} className="space-y-4">
              {/* Full name */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Owner Full Name</label>
                <Input
                  {...form2.register('fullName')}
                  placeholder="Jane Smith"
                  autoFocus
                />
                {form2.formState.errors.fullName && (
                  <p className="text-xs text-red-500">{form2.formState.errors.fullName.message}</p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Initial Password</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      {...form2.register('password')}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min. 8 characters"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    title="Generate password"
                    onClick={() => {
                      const p = generatePassword()
                      form2.setValue('password', p, { shouldValidate: true })
                      setShowPassword(true)
                    }}
                    className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors whitespace-nowrap"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                    Generate
                  </button>
                </div>
                {form2.formState.errors.password && (
                  <p className="text-xs text-red-500">{form2.formState.errors.password.message}</p>
                )}
                <p className="text-xs text-gray-400">
                  The owner will receive this via welcome email and should change it on first login.
                </p>
              </div>

              {/* Branch name */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Main Branch Name</label>
                <Input
                  {...form2.register('mainBranchName')}
                  placeholder="e.g. London Main"
                />
                {form2.formState.errors.mainBranchName && (
                  <p className="text-xs text-red-500">{form2.formState.errors.mainBranchName.message}</p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1">
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button type="submit" className="flex-1">
                  Continue <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Plan Selection ────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Billing toggle */}
          <div className="flex items-center justify-center">
            <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1 gap-1">
              {(['monthly', 'yearly'] as const).map(cycle => (
                <button
                  key={cycle}
                  type="button"
                  onClick={() => setBilling(cycle)}
                  className={[
                    'rounded-md px-4 py-1.5 text-sm font-medium transition-colors capitalize',
                    billing === cycle ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                  ].join(' ')}
                >
                  {cycle}
                  {cycle === 'yearly' && <span className="ml-1 text-xs text-teal-600 font-semibold">-20%</span>}
                </button>
              ))}
            </div>
          </div>

          {plansLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-48 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {plans.map(plan => {
                const price = billing === 'yearly' ? plan.price_yearly : plan.price_monthly
                const isSelected = selectedPlan?.id === plan.id
                const isEnterprise = plan.plan_type === 'enterprise'
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(isSelected ? null : plan)}
                    className={[
                      'relative rounded-xl border-2 p-4 text-left transition-all duration-150 w-full',
                      isSelected
                        ? 'border-teal-600 bg-teal-50 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-teal-300 hover:shadow-sm',
                    ].join(' ')}
                  >
                    {isSelected && (
                      <span className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-teal-600">
                        <Check className="h-3 w-3 text-white" />
                      </span>
                    )}
                    <p className="font-semibold text-gray-900">{plan.name}</p>
                    {isEnterprise ? (
                      <p className="mt-1 text-sm text-gray-500">Admin-managed pricing</p>
                    ) : price === 0 ? (
                      <p className="mt-1 text-sm text-gray-500">Free — 30-day trial</p>
                    ) : (
                      <p className="mt-1 text-sm text-gray-700">
                        <span className="text-lg font-bold">£{price % 1 === 0 ? price : price.toFixed(2)}</span>
                        <span className="text-gray-400">/{billing === 'yearly' ? 'yr' : 'mo'}</span>
                        <span className="ml-1.5 text-xs text-gray-400">· 30-day trial</span>
                      </p>
                    )}
                    {plan.features && plan.features.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {plan.features.slice(0, 4).map(f => (
                          <li key={f} className="flex items-center gap-1.5 text-xs text-gray-600">
                            <Check className="h-3 w-3 text-teal-500 shrink-0" />
                            {formatFeature(f)}
                          </li>
                        ))}
                        {plan.features.length > 4 && (
                          <li className="text-xs text-gray-400">+{plan.features.length - 4} more</li>
                        )}
                      </ul>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setStep(2)} className="flex-1">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              type="button"
              onClick={() => setStep(4)}
              className="flex-1"
            >
              {selectedPlan ? 'Continue' : 'Continue without plan'} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Review & Submit ───────────────────────────────────────── */}
      {step === 4 && step1Data && step2Data && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-5">
              {/* Business Info */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Business Info</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <span className="text-gray-500">Name</span>
                  <span className="font-medium text-gray-900">{step1Data.businessName}</span>
                  <span className="text-gray-500">Subdomain</span>
                  <span className="font-medium text-gray-900">{step1Data.subdomain}.repairbooking.co.uk</span>
                  <span className="text-gray-500">Email</span>
                  <span className="font-medium text-gray-900">{step1Data.email}</span>
                  <span className="text-gray-500">Phone</span>
                  <span className="font-medium text-gray-900">{step1Data.phone}</span>
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* Account Setup */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Account Setup</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <span className="text-gray-500">Owner Name</span>
                  <span className="font-medium text-gray-900">{step2Data.fullName}</span>
                  <span className="text-gray-500">Password</span>
                  <span className="font-medium text-gray-900 font-mono">{'•'.repeat(Math.min(step2Data.password.length, 12))}</span>
                  <span className="text-gray-500">Main Branch</span>
                  <span className="font-medium text-gray-900">{step2Data.mainBranchName}</span>
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* Plan */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Plan</p>
                {selectedPlan ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-900">{selectedPlan.name}</span>
                    <span className="text-gray-500 capitalize">{billing} billing</span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No plan selected — business will have no active subscription</p>
                )}
              </div>
            </CardContent>
          </Card>

          {serverError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {serverError}
            </div>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(3)} className="flex-1" disabled={submitting}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 bg-teal-600 hover:bg-teal-700"
            >
              {submitting ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /> Onboarding…</>
              ) : (
                <>Onboard Business <ChevronRight className="h-4 w-4" /></>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
