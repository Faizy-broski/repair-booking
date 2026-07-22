'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Card, CardContent } from '@/components/ui/card'
import { COUNTRIES } from '@/lib/countries'
import {
  CheckCircle, Building2, User, CreditCard, Check, Zap, Mail,
  ChevronRight, ArrowLeft, Sparkles, Store, Wrench, ShoppingBag,
  Scissors, Coffee, Monitor, Package, ShieldCheck, RotateCcw, Gift, Globe, MapPin, Link2,
} from 'lucide-react'

import validations from '@/components/layout/number-validations.json'
import { parseGoogleMapsLink } from '@/lib/maps-link'
import {
  CustomPlanCard,
  deriveCustomPlanBaseline,
  makeDefaultCustomPlanState,
  computeCustomPlanPrice,
  toCustomPlanPayload,
  type CustomPlanState,
} from '@/components/landing/custom-plan-card'
import { ANNUAL_DISCOUNT } from '@/lib/pricing'

// ── Schemas ───────────────────────────────────────────────────────────────────

const step1Schema = z.object({
  businessName: z.string().min(2, 'Business name is required'),
  subdomain: z.string().min(2).max(30).regex(/^[a-z0-9-]+$/, { message: 'Only lowercase letters, numbers, and hyphens' }),
  email: z.string().email('Invalid email'),
  phone: z.string().min(5, 'Phone number is required'),
  website: z.string().optional(),
  whatsapp: z.string().min(5, 'WhatsApp number is required'),
  country: z.string().min(1, 'Country is required'),
  city: z.string().min(1, 'City is required'),
  address: z.string().min(1, 'Address is required'),
  mapsUrl: z.string().optional(),
}).refine((data) => {
  if (!data.phone.startsWith('+')) return true // Basic validation already handled by min(5)

  // Find the matching validation rule by checking which dial code the phone starts with.
  // We sort by length descending to match +1-246 before +1.
  const sortedValidations = [...validations].sort((a, b) => b.phone.length - a.phone.length)
  const rule = sortedValidations.find(v => data.phone.startsWith('+' + v.phone.replace('-', '')))
  
  if (!rule) return true // No rule found, allow it (fallback to basic min(5))

  const dialCode = rule.phone.replace('-', '')
  const digitsOnly = data.phone.slice(dialCode.length + 1) // Remove + and dialCode
  const length = digitsOnly.length

  if (Array.isArray(rule.phoneLength)) {
    return rule.phoneLength.includes(length)
  }
  if (rule.phoneLength) {
    return length === rule.phoneLength
  }
  // Fallback to min/max if phoneLength is missing
  if (rule.min && length < rule.min) return false
  if (rule.max && length > rule.max) return false
  
  return true
}, {
  message: 'Invalid phone number length for the selected country',
  path: ['phone'],
})

const step2Schema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  password: z.string().min(8, 'Minimum 8 characters'),
  confirmPassword: z.string(),
  mainBranchName: z.string().min(2, 'Branch name is required'),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match', path: ['confirmPassword'],
})

type Step1Data = z.infer<typeof step1Schema>
type Step2Data = z.infer<typeof step2Schema>

// ── Types ─────────────────────────────────────────────────────────────────────

interface DbPlan {
  id: string; name: string; price_monthly: number; price_yearly: number
  max_branches: number; max_users: number; features: string[]
  limits?: Record<string, number | boolean | null> | null
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
  wrench: { bg: 'bg-blue-100', text: 'text-blue-600' },
  store: { bg: 'bg-indigo-100', text: 'text-indigo-600' },
  'shopping-bag': { bg: 'bg-violet-100', text: 'text-violet-600' },
  scissors: { bg: 'bg-pink-100', text: 'text-pink-600' },
  coffee: { bg: 'bg-amber-100', text: 'text-amber-600' },
  monitor: { bg: 'bg-cyan-100', text: 'text-cyan-600' },
  package: { bg: 'bg-green-100', text: 'text-green-600' },
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

// step 1=Business, 2=VerifyEmail, 3=Account, 4=Plan
const STEPS = [
  { label: 'Business', icon: Building2 },
  { label: 'Verify Email', icon: ShieldCheck },
  { label: 'Account', icon: User },
  { label: 'Plan', icon: CreditCard },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter()

  // 1=Business 2=VerifyEmail 3=Account 4=Plan
  const [step, setStep] = useState(1)

  // Template picker state
  const [templates, setTemplates] = useState<VerticalTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState<VerticalTemplate | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState<VerticalTemplate | null>(null)

  // Existing form state
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null)
  const [step2Data, setStep2Data] = useState<Step2Data | null>(null)

  // OTP verification state
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', ''])
  const [otpError, setOtpError] = useState('')
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [otpSending, setOtpSending] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const [resendCount, setResendCount] = useState(0)
  const [selectedPlan, setSelectedPlan] = useState<DbPlan | null>(null)
  const [isCustomSelected, setIsCustomSelected] = useState(false)
  const [customPlan, setCustomPlan] = useState<CustomPlanState | null>(null)
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null)
  const [checkingSubdomain, setCheckingSubdomain] = useState(false)
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null)
  const [checkingEmail, setCheckingEmail] = useState(false)
  const [serverError, setServerError] = useState('')
  const [proceeding, setProceeding] = useState(false)
  const [plans, setPlans] = useState<DbPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(false)
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')
  const [noWebsite, setNoWebsite] = useState(false)

  const customPlanBaseline = useMemo(() => deriveCustomPlanBaseline(plans), [plans])
  const effectiveCustomPlan = customPlan ?? makeDefaultCustomPlanState(customPlanBaseline)

  const form1 = useForm<Step1Data>({ resolver: zodResolver(step1Schema) })
  const form2 = useForm<Step2Data>({ resolver: zodResolver(step2Schema) })
  const mapsUrlValue = form1.watch('mapsUrl')
  const mapsEmbedSrc = useMemo(() => parseGoogleMapsLink(mapsUrlValue ?? ''), [mapsUrlValue]).embedSrc

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
    if (step === 4 && plans.length === 0) {
      setPlansLoading(true)
      fetch('/api/plans')
        .then(r => r.json())
        .then(j => { if (j.data) setPlans(j.data) })
        .catch(() => { })
        .finally(() => setPlansLoading(false))
    }
  }, [step, plans.length])

  // Marketing pricing page's "Custom Plan" CTA stashes the chosen config here
  // before redirecting to /register — pick it up once and pre-select Custom.
  useEffect(() => {
    if (step !== 4) return
    const pending = sessionStorage.getItem('pendingCustomPlan')
    if (!pending) return
    try {
      const parsed = JSON.parse(pending) as CustomPlanState
      setCustomPlan(parsed)
      setIsCustomSelected(true)
      setSelectedPlan(null)
    } catch { /* ignore malformed value */ }
    sessionStorage.removeItem('pendingCustomPlan')
  }, [step])

  const isFreePlan = selectedPlan?.price_monthly === 0
  const isEnterprisePlan = selectedPlan?.plan_type === 'enterprise'

  // ── Validation helpers ────────────────────────────────────────────────────
  const checkSubdomainTimeout = useRef<NodeJS.Timeout | null>(null)

  async function checkSubdomain(value: string) {
    if (value.length < 2) {
      setSubdomainAvailable(null)
      return
    }
    setCheckingSubdomain(true)
    
    if (checkSubdomainTimeout.current) {
      clearTimeout(checkSubdomainTimeout.current)
    }
    
    checkSubdomainTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-subdomain?subdomain=${encodeURIComponent(value)}`)
        const json = await res.json()
        setSubdomainAvailable(json.data?.available ?? false)
      } finally {
        setCheckingSubdomain(false)
      }
    }, 500)
  }

  async function checkEmail(value: string) {
    if (!value.includes('@')) return false
    setCheckingEmail(true)
    setEmailAvailable(null)
    try {
      const res = await fetch(`/api/auth/check-email?email=${encodeURIComponent(value)}`)
      const json = await res.json()
      const available = json.data?.available ?? false
      setEmailAvailable(available)
      setCheckingEmail(false)
      return available
    } catch {
      setEmailAvailable(null)
      setCheckingEmail(false)
      return false
    }
  }

  // ── Form handlers ─────────────────────────────────────────────────────────
  async function onStep1Submit(data: Step1Data) {
    // 1. Validate Subdomain availability
    if (subdomainAvailable === false) {
      form1.setError('subdomain', { message: 'This subdomain is already taken' })
      return
    }
    if (!data.subdomain) {
      form1.setError('subdomain', { message: 'Subdomain is required' })
      return
    }
    if (subdomainAvailable === null) {
      await checkSubdomain(data.subdomain)
      // wait a bit for the state to update or just check the result directly if we refactored
      // but for now, we'll just check if it's still null after the call
      return 
    }

    // 2. Validate Email availability
    if (emailAvailable === false) {
      form1.setError('email', { message: 'Email already exists' })
      return
    }
    if (emailAvailable === null) {
      const isAvailable = await checkEmail(data.email)
      if (!isAvailable) {
        form1.setError('email', { message: 'An account with this email already exists' })
        return
      }
    }

    if (!noWebsite && !data.website?.trim()) {
      form1.setError('website', { message: 'Enter your website URL or tick "Don\'t have a website"' })
      return
    }

    setStep1Data(data)
    await sendOtp(data.email)
    setStep(2)
  }

  function onStep2Submit(data: Step2Data) {
    setStep2Data(data)
    setStep(4)
  }

  async function sendOtp(email: string) {
    setOtpSending(true)
    setOtpError('')
    try {
      await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    } catch { }
    setOtpSending(false)
    setResendCountdown(60)
  }

  // countdown tick for resend button
  useEffect(() => {
    if (resendCountdown <= 0) return
    const t = setTimeout(() => setResendCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCountdown])

  async function handleResendOtp() {
    if (!step1Data || resendCountdown > 0 || resendCount >= 3) return
    setResendCount(c => c + 1)
    setOtpDigits(['', '', '', '', '', ''])
    setOtpError('')
    await sendOtp(step1Data.email)
  }

  async function handleVerifyOtp() {
    const otp = otpDigits.join('')
    if (otp.length < 6) { setOtpError('Enter all 6 digits'); return }
    setOtpVerifying(true)
    setOtpError('')
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: step1Data!.email, otp }),
      })
      const json = await res.json()
      if (json.data?.verified) {
        setStep(3)
      } else {
        setOtpError(json.error?.message ?? 'Incorrect code. Please try again.')
      }
    } catch {
      setOtpError('Something went wrong. Please try again.')
    }
    setOtpVerifying(false)
  }

  function handleOtpInput(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...otpDigits]
    next[index] = digit
    setOtpDigits(next)
    setOtpError('')
    if (digit && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus()
    }
    // Auto-submit when last digit filled
    if (digit && index === 5) {
      const full = next.join('')
      if (full.length === 6) setTimeout(() => handleVerifyOtpWithDigits(next), 0)
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus()
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = [...otpDigits]
    pasted.split('').forEach((d, i) => { next[i] = d })
    setOtpDigits(next)
    setOtpError('')
    document.getElementById(`otp-${Math.min(pasted.length, 5)}`)?.focus()
    if (pasted.length === 6) setTimeout(() => handleVerifyOtpWithDigits(next), 0)
  }

  async function handleVerifyOtpWithDigits(digits: string[]) {
    const otp = digits.join('')
    if (otp.length < 6) return
    setOtpVerifying(true)
    setOtpError('')
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: step1Data!.email, otp }),
      })
      const json = await res.json()
      if (json.data?.verified) {
        setStep(3)
      } else {
        setOtpError(json.error?.message ?? 'Incorrect code. Please try again.')
      }
    } catch {
      setOtpError('Something went wrong. Please try again.')
    }
    setOtpVerifying(false)
  }

  async function handleProceedToPayment() {
    if (!step1Data || !step2Data || (!selectedPlan && !isCustomSelected)) return
    setServerError('')
    setProceeding(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...step1Data, ...step2Data,
          ...(isCustomSelected
            ? { customPlan: toCustomPlanPayload(effectiveCustomPlan) }
            : { planId: selectedPlan!.id }),
          ...(selectedTemplate ? { verticalTemplateSlug: selectedTemplate.slug } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setServerError(json.error?.message ?? 'Registration failed. Please try again.')
        setProceeding(false)
        return
      }
      window.location.href = `/register/success?subdomain=${encodeURIComponent(step1Data.subdomain.toLowerCase())}`
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
              <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${stepNumber < step ? 'bg-primary-container text-on-primary-container' :
                stepNumber === step ? 'bg-primary text-on-primary shadow-sm shadow-primary/30' :
                  'bg-surface-container-high text-on-surface-variant'
                }`}>
                {stepNumber < step ? <CheckCircle className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                {label}
              </div>
              {i < STEPS.length - 1 && <div className="w-5 h-px bg-outline-variant" />}
            </div>
          )
        })}
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
              {[1, 2, 3, 4, 5, 6].map(i => (
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
        <div className="mx-auto w-full max-w-md sm:max-w-2xl">
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

                {/* Row 1: Business name + Subdomain */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
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
                      {...form1.register('subdomain', {
                        onChange: e => {
                          const sanitized = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                          form1.setValue('subdomain', sanitized, { shouldValidate: true })
                          checkSubdomain(sanitized)
                        }
                      })}
                    />
                    {!form1.formState.errors.subdomain && (
                      <p className={`mt-1 text-xs ${subdomainAvailable === true ? 'text-primary' :
                        subdomainAvailable === false ? 'text-error' : 'text-on-surface-variant'
                        }`}>
                        {checkingSubdomain
                          ? 'Checking…'
                          : subdomainAvailable === true
                            ? `✓ ${form1.watch('subdomain') || ''}.repairbooking.co.uk`
                            : subdomainAvailable === false
                              ? '✗ Already taken'
                              : '[subdomain].repairbooking.co.uk'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Row 2: Email + Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
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
                            ? '✗ Email already exists.'
                            : null}
                      </p>
                    )}
                  </div>
                  <PhoneInput
                    label="Phone number"
                    value={form1.watch('phone') ?? ''}
                    onChange={(val) => form1.setValue('phone', val, { shouldValidate: true })}
                    error={form1.formState.errors.phone?.message}
                  />
                </div>

                {/* Row 3: Website + WhatsApp */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-on-surface">Website</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <Globe className="h-4 w-4" />
                      </span>
                      <input
                        type="url"
                        placeholder="https://yourwebsite.com"
                        disabled={noWebsite}
                        className={`w-full rounded-lg border px-3 py-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 ${noWebsite ? 'cursor-not-allowed bg-gray-50 text-gray-400' : ''} ${form1.formState.errors.website ? 'border-error' : 'border-gray-300'}`}
                        {...form1.register('website')}
                      />
                    </div>
                    <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-sm text-on-surface-variant">
                      <input
                        type="checkbox"
                        checked={noWebsite}
                        onChange={e => {
                          setNoWebsite(e.target.checked)
                          if (e.target.checked) {
                            form1.setValue('website', '')
                            form1.clearErrors('website')
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300 accent-primary"
                      />
                      Don&apos;t have a website
                    </label>
                    {form1.formState.errors.website && (
                      <p className="mt-1 text-xs text-error">{form1.formState.errors.website.message}</p>
                    )}
                  </div>
                  <PhoneInput
                    label="WhatsApp number"
                    value={form1.watch('whatsapp') ?? ''}
                    onChange={(val) => form1.setValue('whatsapp', val, { shouldValidate: true })}
                    error={form1.formState.errors.whatsapp?.message}
                  />
                </div>

                {/* Row 4: Country + City */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-on-surface">Country</label>
                    <select
                      className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white ${form1.formState.errors.country ? 'border-error' : 'border-gray-300'}`}
                      {...form1.register('country')}
                    >
                      <option value="">Select country</option>
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>{c.name}</option>
                      ))}
                      <option value="OTHER">Other</option>
                    </select>
                    {form1.formState.errors.country && (
                      <p className="mt-1 text-xs text-error">{form1.formState.errors.country.message}</p>
                    )}
                  </div>
                  <Input
                    label="City"
                    placeholder="London"
                    error={form1.formState.errors.city?.message}
                    {...form1.register('city')}
                  />
                </div>

                {/* Row 5: Full Address */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-on-surface">Full Address</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <MapPin className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="123 High Street, London, E1 6RF"
                      className={`w-full rounded-lg border px-3 py-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 ${form1.formState.errors.address ? 'border-error' : 'border-gray-300'}`}
                      {...form1.register('address')}
                    />
                  </div>
                  {form1.formState.errors.address && (
                    <p className="mt-1 text-xs text-error">{form1.formState.errors.address.message}</p>
                  )}
                </div>

                {/* Row 6: Google Maps Link */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-on-surface">
                    Google Maps Link <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <Link2 className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="https://maps.google.com/... or https://maps.app.goo.gl/..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      {...form1.register('mapsUrl')}
                    />
                  </div>
                  {mapsUrlValue && (
                    mapsEmbedSrc ? (
                      <iframe
                        src={mapsEmbedSrc}
                        loading="lazy"
                        className="mt-2 h-48 w-full rounded-lg border border-gray-200"
                      />
                    ) : (
                      <p className="mt-1 text-xs text-gray-500">
                        Can&apos;t preview shortened links — it&apos;ll still be saved and linked on your profile.{' '}
                        <a href={mapsUrlValue} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                          Open link
                        </a>
                      </p>
                    )
                  )}
                </div>

                <div className="flex gap-2">
                  {/* <Button type="button" variant="outline" onClick={() => setStep(0)}>
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button> */}
                  <Button
                    type="submit"
                    className="flex-1"
                    loading={otpSending}
                    disabled={checkingSubdomain || checkingEmail}
                  >
                    {otpSending ? 'Sending OTP...' : 'Continue'}
                    {!otpSending && <ChevronRight className="h-4 w-4" />}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Step 2: Verify Email ──────────────────────────────────────────── */}
      {step === 2 && (
        <div className="mx-auto max-w-md">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-6">
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50">
                    <ShieldCheck className="h-6 w-6 text-teal-600" />
                  </div>
                  <h2 className="text-lg font-bold text-on-surface">Check your email</h2>
                  <p className="text-sm text-on-surface-variant mt-1">
                    We sent a 6-digit code to<br />
                    <strong className="text-on-surface">{step1Data?.email}</strong>
                  </p>
                </div>

                {/* OTP boxes */}
                <div className="flex justify-center gap-2">
                  {otpDigits.map((digit, i) => (
                    <input
                      key={i}
                      id={`otp-${i}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleOtpInput(i, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(i, e)}
                      onPaste={i === 0 ? handleOtpPaste : undefined}
                      disabled={otpVerifying}
                      autoFocus={i === 0}
                      className={`h-13 w-11 rounded-xl border-2 text-center text-xl font-bold transition-colors focus:outline-none ${otpError
                        ? 'border-red-400 bg-red-50 text-red-700'
                        : digit
                          ? 'border-teal-500 bg-teal-50 text-teal-800'
                          : 'border-gray-300 bg-white text-gray-900 focus:border-teal-500'
                        }`}
                      style={{ height: '3.25rem' }}
                    />
                  ))}
                </div>

                {otpError && (
                  <p className="text-center text-sm text-red-600">{otpError}</p>
                )}

                {otpVerifying && (
                  <p className="text-center text-sm text-teal-600 animate-pulse">Verifying…</p>
                )}

                <Button
                  className="w-full"
                  onClick={handleVerifyOtp}
                  loading={otpVerifying}
                  disabled={otpDigits.join('').length < 6}
                >
                  <ShieldCheck className="h-4 w-4" /> Verify Email
                </Button>

                {/* Resend */}
                <div className="text-center space-y-1">
                  {resendCountdown > 0 ? (
                    <p className="text-sm text-on-surface-variant">
                      Resend code in <strong className="text-on-surface">{resendCountdown}s</strong>
                    </p>
                  ) : resendCount >= 3 ? (
                    <p className="text-sm text-on-surface-variant">Maximum resends reached. Please restart.</p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={otpSending}
                      className="inline-flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 font-medium disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {otpSending ? 'Sending…' : "Didn't receive it? Resend code"}
                    </button>
                  )}
                  <p className="text-xs text-on-surface-variant">Also check your spam folder</p>
                </div>

                <button
                  type="button"
                  onClick={() => { setStep(1); setOtpDigits(['', '', '', '', '', '']); setOtpError('') }}
                  className="flex w-full items-center justify-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back — change email
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Step 3: Account Setup ─────────────────────────────────────────── */}
      {step === 3 && (
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
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(2)}>
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

      {/* ── Step 4: Choose Plan ───────────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-on-surface">Choose your plan</h2>
            <p className="text-on-surface-variant mt-1">30-day free trial on all plans. No credit card required.</p>

            {/* Billing toggle */}
            <div className="mt-5 inline-flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container p-1.5">
              <button
                type="button"
                onClick={() => setBilling('monthly')}
                className={`rounded-xl px-5 py-2 text-sm font-semibold transition-all ${billing === 'monthly' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBilling('yearly')}
                className={`relative rounded-xl px-5 py-2 text-sm font-semibold transition-all ${billing === 'yearly' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                Annual
                <span className="absolute -top-3 -right-3 rounded-full bg-brand-yellow px-1.5 py-0.5 text-[10px] font-black text-slate-900 shadow">
                  -{Math.round(ANNUAL_DISCOUNT * 100)}%
                </span>
              </button>
            </div>
          </div>

          {plansLoading ? (
            <div className="flex items-center justify-center py-20 text-on-surface-variant">Loading plans...</div>
          ) : (
            <div className={`grid gap-8 items-stretch ${plans.length + 1 === 4 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' :
              plans.length + 1 === 3 ? 'grid-cols-1 md:grid-cols-3' :
                'grid-cols-1 md:grid-cols-2 max-w-3xl mx-auto'
              }`}>
              {plans.map((plan, index) => {
                const highlighted = isPlanHighlighted(plans, index)
                const isSelected = !isCustomSelected && selectedPlan?.id === plan.id
                const isTrulyFree = plan.price_monthly === 0
                const isEnterprise = plan.plan_type === 'enterprise'
                const isYearly = billing === 'yearly' && !isTrulyFree && !isEnterprise
                const yearlyTotal = Math.round(plan.price_monthly * 12 * (1 - ANNUAL_DISCOUNT))
                const fmtPrice = (n: number) => n % 1 === 0 ? String(Math.round(n)) : n.toFixed(2)

                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => { setSelectedPlan(plan); setIsCustomSelected(false) }}
                    className={`relative flex flex-col rounded-3xl border-2 p-8 text-left transition-all duration-200 ${highlighted
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

                    <p className={`text-[11px] font-bold uppercase tracking-[0.15em] mb-3 ${highlighted ? 'text-on-primary/60' : 'text-on-surface-variant'}`}>
                      {plan.name}
                    </p>

                    {/* 30-day trial badge */}
                    {!isEnterprise && (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold mb-3 w-fit ${highlighted ? 'bg-on-primary/20 text-on-primary' : 'bg-primary/10 text-primary'}`}>
                        <Gift className="h-3 w-3" /> 30 days free trial
                      </span>
                    )}

                    <div className="flex items-end gap-1 mb-1">
                      {isEnterprise ? (
                        <span className={`text-5xl font-black leading-none ${highlighted ? 'text-on-primary' : 'text-on-surface'}`}>Custom</span>
                      ) : isYearly ? (
                        <>
                          <span className={`text-5xl font-black leading-none ${highlighted ? 'text-on-primary' : 'text-on-surface'}`}>£{yearlyTotal}</span>
                          <span className={`text-base mb-1.5 ${highlighted ? 'text-on-primary/60' : 'text-on-surface-variant'}`}>/yr</span>
                        </>
                      ) : (
                        <>
                          <span className={`text-5xl font-black leading-none ${highlighted ? 'text-on-primary' : 'text-on-surface'}`}>
                            £{fmtPrice(plan.price_monthly)}
                          </span>
                          <span className={`text-base mb-1.5 ${highlighted ? 'text-on-primary/60' : 'text-on-surface-variant'}`}>/mo</span>
                        </>
                      )}
                    </div>

                    {/* Post-trial / billing note */}
                    {!isEnterprise && (
                      <p className={`text-xs mb-5 ${highlighted ? 'text-on-primary/50' : 'text-on-surface-variant'}`}>
                        {isTrulyFree
                          ? 'Free forever — no credit card required'
                          : isYearly
                            ? `Save £${Math.round(plan.price_monthly * 12) - yearlyTotal} vs monthly — after 30-day trial`
                            : `Then £${fmtPrice(plan.price_monthly)}/mo after 30-day trial`}
                      </p>
                    )}
                    {isEnterprise && (
                      <p className={`text-xs mb-5 ${highlighted ? 'text-on-primary/50' : 'text-on-surface-variant'}`}>Tailored quote for your business</p>
                    )}

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
                      <div className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-all ${isSelected
                        ? highlighted ? 'bg-on-primary/25 text-on-primary' : 'bg-primary text-on-primary'
                        : highlighted ? 'bg-on-primary/10 text-on-primary/80 hover:bg-on-primary/20' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                        }`}>
                        {isSelected
                          ? <><CheckCircle className="h-4 w-4" /> Selected</>
                          : isEnterprise ? 'Contact sales' : 'Select this plan'}
                      </div>
                    </div>
                  </button>
                )
              })}
              <CustomPlanCard
                state={effectiveCustomPlan}
                onChange={(next) => { setCustomPlan(next); setIsCustomSelected(true); setSelectedPlan(null) }}
                baseline={customPlanBaseline}
                highlight={isCustomSelected}
                ctaLabel={isCustomSelected ? 'Selected' : 'Select Custom Plan'}
                onCtaClick={() => { setIsCustomSelected(true); setSelectedPlan(null) }}
              />
            </div>
          )}

          {serverError && (
            <div className="mx-auto max-w-md rounded-lg border border-error-container/40 bg-error-container/15 px-4 py-3 text-sm text-on-error-container">{serverError}</div>
          )}

          <div className="flex items-center gap-3 max-w-sm mx-auto">
            <Button type="button" variant="outline" onClick={() => setStep(3)}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {isEnterprisePlan ? (
              <Button className="flex-1" loading={proceeding} onClick={handleEnterpriseContact}>
                <Mail className="h-4 w-4" /> Contact sales team
              </Button>
            ) : (
              <Button className="flex-1" loading={proceeding} disabled={!selectedPlan && !isCustomSelected} onClick={handleProceedToPayment}>
                <Zap className="h-4 w-4" />
                {isCustomSelected
                  ? `Start free trial — £${computeCustomPlanPrice(effectiveCustomPlan, customPlanBaseline)}/mo`
                  : selectedPlan
                    ? isFreePlan
                      ? 'Start 30-day free trial'
                      : (() => {
                          const isYearly = billing === 'yearly'
                          const price = isYearly
                            ? Math.round(selectedPlan.price_monthly * 12 * (1 - ANNUAL_DISCOUNT))
                            : selectedPlan.price_monthly
                          const fmt = (n: number) => n % 1 === 0 ? String(Math.round(n)) : n.toFixed(2)
                          return `Start free trial — £${fmt(price)}${isYearly ? '/year' : '/mo'}`
                        })()
                    : 'Select a plan to continue'}
              </Button>
            )}
          </div>

          <p className="text-center text-xs text-on-surface-variant">
            No credit card charged until trial ends · Cancel anytime
          </p>
        </div>
      )}
    </div>
  )
}
