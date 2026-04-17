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
import {
  CheckCircle, Building2, User, CreditCard, Check, Zap, Mail,
  ChevronRight, ArrowLeft, Sparkles, Store, Wrench, ShoppingBag,
  Scissors, Coffee, Monitor, Package, Layers,
} from 'lucide-react'

// ── Schemas ───────────────────────────────────────────────────────────────────

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

// ── Types ─────────────────────────────────────────────────────────────────────

interface DbPlan {
  id: string; name: string; price_monthly: number
  max_branches: number; max_users: number; features: string[]
  stripe_price_id_monthly: string | null; plan_type: 'free' | 'paid' | 'enterprise'
}

interface VerticalTemplate {
  id: string; name: string; slug: string; description: string | null
  icon: string; modules_enabled: string[]; is_active: boolean; sort_order: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  pos: 'POS', inventory: 'Inventory', repairs: 'Repairs', customers: 'Customers',
  appointments: 'Appointments', expenses: 'Expenses', employees: 'Employees',
  reports: 'Reports', messages: 'Messages', invoices: 'Invoices',
  gift_cards: 'Gift Cards', google_reviews: 'Google Reviews', phone: 'Phone',
}

const ICON_MAP: Record<string, React.ElementType> = {
  store: Store, wrench: Wrench, 'shopping-bag': ShoppingBag,
  scissors: Scissors, coffee: Coffee, monitor: Monitor, package: Package,
}

const ICON_COLORS: Record<string, { bg: string; text: string }> = {
  wrench:         { bg: 'bg-blue-100',   text: 'text-blue-600' },
  store:          { bg: 'bg-indigo-100', text: 'text-indigo-600' },
  'shopping-bag': { bg: 'bg-violet-100', text: 'text-violet-600' },
  scissors:       { bg: 'bg-pink-100',   text: 'text-pink-600' },
  coffee:         { bg: 'bg-amber-100',  text: 'text-amber-600' },
  monitor:        { bg: 'bg-cyan-100',   text: 'text-cyan-600' },
  package:        { bg: 'bg-green-100',  text: 'text-green-600' },
}

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

function isPlanHighlighted(plans: DbPlan[], index: number): boolean {
  return plans.length >= 2 && index === Math.floor(plans.length / 2)
}

// Step labels — template picker is index 0
const STEPS = [
  // { label: 'Business Type', icon: Layers },
  { label: 'Business',      icon: Building2 },
  { label: 'Account',       icon: User },
  { label: 'Plan',          icon: CreditCard },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter()

  // step 0 = template picker, 1 = business info, 2 = account, 3 = plan
  const [step, setStep] = useState(1)

  // Template picker state
  const [templates, setTemplates] = useState<VerticalTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState<VerticalTemplate | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState<VerticalTemplate | null>(null)

  // Existing form state
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

  // ── Fetch templates (public, cached at edge) ──────────────────────────────
  /*
  useEffect(() => {
    fetch('/api/vertical-templates/public')
      .then(r => r.json())
      .then(j => setTemplates(j.data ?? []))
      .catch(() => {})
      .finally(() => setTemplatesLoading(false))
  }, [])
  */

  // ── Fetch plans when reaching step 3 ──────────────────────────────────────
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

  const isFreePlan = selectedPlan?.plan_type === 'free'
  const isEnterprisePlan = selectedPlan?.plan_type === 'enterprise'

  // ── Validation helpers ────────────────────────────────────────────────────
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
    } catch { setEmailAvailable(null) }
    setCheckingEmail(false)
  }

  // ── Form handlers ─────────────────────────────────────────────────────────
  function onStep1Submit(data: Step1Data) {
    if (!subdomainAvailable) return
    if (emailAvailable === false) return
    setStep1Data(data)
    setStep(2)
  }

  function onStep2Submit(data: Step2Data) {
    setStep2Data(data)
    setStep(3)
  }

  async function handleProceedToPayment() {
    if (!step1Data || !step2Data || !selectedPlan) return
    setServerError('')
    setProceeding(true)
    const payload = {
      ...step1Data,
      ...step2Data,
      planId: selectedPlan.id,
      ...(selectedTemplate ? { verticalTemplateSlug: selectedTemplate.slug } : {}),
    }
    try {
      if (isFreePlan) {
        const regRes = await fetch('/api/auth/register', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const regJson = await regRes.json()
        if (!regRes.ok || regJson.error) {
          setServerError(regJson.error?.message ?? 'Registration failed. Please try again.')
          setProceeding(false)
          return
        }
        const subdomain = step1Data.subdomain.toLowerCase()
        const host = window.location.hostname
        const port = window.location.port
        const base = host === 'localhost'
          ? `http://${subdomain}.localhost${port ? ':' + port : ''}`
          : `https://${subdomain}.${host.split('.').slice(-2).join('.')}`
        window.location.href = `${base}/dashboard`
        return
      }

      const checkoutRes = await fetch('/api/stripe/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...step1Data, ...step2Data, planId: 'enterprise',
        ...(selectedTemplate ? { verticalTemplateSlug: selectedTemplate.slug } : {}),
      }),
    })
    if (res.ok) {
      router.push('/register/enterprise-success')
    } else {
      const j = await res.json()
      setServerError(j.error?.message ?? 'Something went wrong.')
    }
    setProceeding(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full">

      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-center gap-1 flex-wrap">
        {STEPS.map(({ label, icon: Icon }, i) => {
          const stepNumber = i + 1;
          return (
          <div key={i} className="flex items-center gap-1">
            <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              stepNumber < step   ? 'bg-primary-container text-on-primary-container' :
              stepNumber === step ? 'bg-primary text-on-primary shadow-sm shadow-primary/30' :
                           'bg-surface-container-high text-on-surface-variant'
            }`}>
              {stepNumber < step ? <CheckCircle className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              {label}
            </div>
            {i < STEPS.length - 1 && <div className="w-5 h-px bg-outline-variant" />}
          </div>
        )})}
      </div>

      {/* ── Step 0: Business Type ─────────────────────────────────────────── */}
      {false && step === 0 && (
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-on-surface">What type of business are you?</h2>
            <p className="text-on-surface-variant mt-1 text-sm">
              We'll pre-configure the right modules for you. You can always change this later.
            </p>
          </div>

          {templatesLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="h-36 animate-pulse rounded-2xl bg-surface-container" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {templates.map((t) => {
                const IconComp = ICON_MAP[t.icon] ?? Store
                const colors = ICON_COLORS[t.icon] ?? { bg: 'bg-gray-100', text: 'text-gray-600' }
                const isSelected = selectedTemplate?.slug === t.slug
                return (
                  <button
                    key={t.slug}
                    type="button"
                    onClick={() => setSelectedTemplate(isSelected ? null : t)}
                    onMouseEnter={() => setPreviewTemplate(t)}
                    onMouseLeave={() => setPreviewTemplate(null)}
                    className={[
                      'relative flex flex-col items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all duration-150',
                      isSelected
                        ? 'border-primary bg-primary-container/20 shadow-md shadow-primary/10'
                        : 'border-outline-variant bg-surface-container-lowest hover:border-primary/40 hover:shadow-sm',
                    ].join(' ')}
                  >
                    {isSelected && (
                      <span className="absolute top-3 right-3">
                        <CheckCircle className="h-4 w-4 text-primary" />
                      </span>
                    )}
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors.bg}`}>
                      <IconComp className={`h-5 w-5 ${colors.text}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-on-surface text-sm leading-tight">{t.name}</p>
                      {t.description && (
                        <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-2 leading-relaxed">{t.description}</p>
                      )}
                      <p className="text-[10px] text-outline mt-1.5">{t.modules_enabled.length} modules included</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Module preview panel — shown on hover */}
          {(previewTemplate ?? selectedTemplate) && (
            <div className="rounded-2xl border border-outline-variant bg-surface-container-low px-5 py-4">
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2">
                {(previewTemplate ?? selectedTemplate)!.name} — Included modules
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(previewTemplate ?? selectedTemplate)!.modules_enabled.map((mod) => (
                  <span
                    key={mod}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                  >
                    <Check className="h-3 w-3" />
                    {MODULE_LABELS[mod] ?? mod}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 max-w-sm mx-auto">
            <button
              type="button"
              onClick={() => { setSelectedTemplate(null); setStep(1) }}
              className="text-sm text-on-surface-variant hover:text-on-surface underline underline-offset-2"
            >
              Skip — I'll choose modules manually
            </button>
            <Button
              onClick={() => setStep(1)}
              disabled={!selectedTemplate && templates.length > 0 && !templatesLoading}
              className="min-w-[140px]"
            >
              {selectedTemplate ? `Continue with ${selectedTemplate.name}` : 'Continue'}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-center text-sm text-on-surface-variant">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:underline font-medium">Sign in</Link>
          </p>
        </div>
      )}

      {/* ── Step 1: Business Info ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="mx-auto max-w-md">
          {/* selectedTemplate && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary-container/10 px-4 py-2.5">
              {(() => { const IC = ICON_MAP[selectedTemplate.icon] ?? Store; return <IC className="h-4 w-4 text-primary shrink-0" /> })()}
              <span className="text-sm text-on-surface">
                Setting up as <strong>{selectedTemplate.name}</strong>
                {' '}· {selectedTemplate.modules_enabled.length} modules pre-configured
              </span>
              <button
                type="button"
                onClick={() => setStep(0)}
                className="ml-auto text-xs text-primary hover:underline shrink-0"
              >
                Change
              </button>
            </div>
          ) */}
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
                        ? 'Checking availability…'
                        : subdomainAvailable === true
                          ? `✓ Available — your URL will be: ${form1.watch('subdomain') || ''}.repairbooking.co.uk`
                          : subdomainAvailable === false
                            ? '✗ Already taken — try another'
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
                    <p className={`mt-1 text-xs ${emailAvailable === false ? 'text-error' : checkingEmail ? 'text-on-surface-variant' : ''}`}>
                      {checkingEmail
                        ? 'Checking…'
                        : emailAvailable === false
                          ? '✗ An account with this email already exists. Please sign in instead.'
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
                <div className="flex gap-2">
                  {/* <Button type="button" variant="outline" onClick={() => setStep(0)}>
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button> */}
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={subdomainAvailable !== true || checkingSubdomain || emailAvailable === false || checkingEmail}
                  >
                    Continue <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Step 2: Account Setup ─────────────────────────────────────────── */}
      {step === 2 && (
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
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>
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

      {/* ── Step 3: Choose Plan ───────────────────────────────────────────── */}
      {step === 3 && (
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
                    {highlighted && (
                      <span className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-brand-yellow px-4 py-1.5 text-xs font-black text-gray-900 whitespace-nowrap shadow-lg">
                        <Sparkles className="h-3 w-3" /> Most popular
                      </span>
                    )}
                    {isSelected && !highlighted && (
                      <span className="absolute top-5 right-5">
                        <CheckCircle className="h-5 w-5 text-brand-teal" />
                      </span>
                    )}
                    <p className={`text-[11px] font-bold uppercase tracking-[0.15em] mb-4 ${highlighted ? 'text-on-primary/60' : 'text-on-surface-variant'}`}>
                      {plan.name}
                    </p>
                    <div className="flex items-end gap-1 mb-2">
                      {isFree ? (
                        <span className={`text-5xl font-black leading-none ${highlighted ? 'text-on-primary' : 'text-on-surface'}`}>Free</span>
                      ) : isEnterprise ? (
                        <span className={`text-5xl font-black leading-none ${highlighted ? 'text-on-primary' : 'text-on-surface'}`}>Custom</span>
                      ) : (
                        <>
                          <span className={`text-5xl font-black leading-none ${highlighted ? 'text-on-primary' : 'text-on-surface'}`}>
                            £{plan.price_monthly % 1 === 0 ? plan.price_monthly : plan.price_monthly.toFixed(2)}
                          </span>
                          <span className={`text-base mb-1.5 ${highlighted ? 'text-on-primary/60' : 'text-on-surface-variant'}`}>/mo</span>
                        </>
                      )}
                    </div>
                    {!isFree && !isEnterprise && <p className={`text-xs mb-6 ${highlighted ? 'text-on-primary/50' : 'text-on-surface-variant'}`}>Billed monthly, cancel anytime</p>}
                    {isFree && <p className={`text-xs mb-6 font-medium ${highlighted ? 'text-on-primary/70' : 'text-primary'}`}>30-day free trial — no credit card needed</p>}
                    {isEnterprise && <p className={`text-xs mb-6 ${highlighted ? 'text-on-primary/50' : 'text-on-surface-variant'}`}>Tailored quote for your business</p>}
                    <div className={`flex gap-3 mb-6 pb-6 border-b ${highlighted ? 'border-on-primary/20' : 'border-outline-variant/30'}`}>
                      <div className={`flex-1 text-center rounded-xl py-2.5 ${highlighted ? 'bg-on-primary/10' : 'bg-surface-container'}`}>
                        <p className={`text-xl font-bold ${highlighted ? 'text-on-primary' : 'text-on-surface'}`}>{plan.max_branches >= 50 ? '∞' : plan.max_branches}</p>
                        <p className={`text-[10px] uppercase tracking-wide mt-0.5 ${highlighted ? 'text-on-primary/50' : 'text-on-surface-variant'}`}>Branches</p>
                      </div>
                      <div className={`flex-1 text-center rounded-xl py-2.5 ${highlighted ? 'bg-on-primary/10' : 'bg-surface-container'}`}>
                        <p className={`text-xl font-bold ${highlighted ? 'text-on-primary' : 'text-on-surface'}`}>{plan.max_users >= 999 ? '∞' : plan.max_users}</p>
                        <p className={`text-[10px] uppercase tracking-wide mt-0.5 ${highlighted ? 'text-on-primary/50' : 'text-on-surface-variant'}`}>Staff</p>
                      </div>
                    </div>
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
                    <div className={`mt-8 pt-6 border-t ${highlighted ? 'border-on-primary/20' : 'border-outline-variant/30'}`}>
                      <div className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-all ${
                        isSelected
                          ? highlighted ? 'bg-on-primary/25 text-on-primary' : 'bg-primary text-on-primary'
                          : highlighted ? 'bg-on-primary/10 text-on-primary/80 hover:bg-on-primary/20' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                      }`}>
                        {isSelected
                          ? <><CheckCircle className="h-4 w-4" /> Selected</>
                          : isFree ? 'Start free — no card needed' : isEnterprise ? 'Contact sales' : 'Select this plan'}
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
            <Button type="button" variant="outline" onClick={() => setStep(2)}>
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
            Secure payment via Stripe · No credit card charged until trial ends
          </p>
        </div>
      )}
    </div>
  )
}
