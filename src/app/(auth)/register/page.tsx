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
import { CheckCircle } from 'lucide-react'

// Step schemas
const step1Schema = z.object({
  businessName: z.string().min(2, 'Business name is required'),
  subdomain: z.string()
    .min(2, 'Subdomain must be at least 2 characters')
    .max(30, 'Subdomain too long')
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
})

const step2Schema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  mainBranchName: z.string().min(2, 'Branch name is required'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type Step1Data = z.infer<typeof step1Schema>
type Step2Data = z.infer<typeof step2Schema>

const STEPS = ['Business Info', 'Account Setup', 'Choose Plan']

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null)
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null)
  const [checkingSubdomain, setCheckingSubdomain] = useState(false)
  const [serverError, setServerError] = useState('')

  const form1 = useForm<Step1Data>({ resolver: zodResolver(step1Schema) })
  const form2 = useForm<Step2Data>({ resolver: zodResolver(step2Schema) })

  async function checkSubdomain(value: string) {
    if (value.length < 2) return
    setCheckingSubdomain(true)
    try {
      const res = await fetch(`/api/auth/check-subdomain?subdomain=${encodeURIComponent(value)}`)
      const json = await res.json()
      setSubdomainAvailable(json.data?.available ?? false)
    } finally {
      setCheckingSubdomain(false)
    }
  }

  async function onStep1Submit(data: Step1Data) {
    if (!subdomainAvailable) return
    setStep1Data(data)
    setStep(1)
  }

  async function onStep2Submit(data: Step2Data) {
    if (!step1Data) return
    setServerError('')

    const payload = {
      ...step1Data,
      ...data,
      planId: null, // will be selected in step 3 (for now skip to create basic)
    }

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const json = await res.json()

    if (json.error) {
      setServerError(json.error.message)
      return
    }

    // Redirect to login after successful registration
    router.push('/login?registered=1')
  }

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                i < step ? 'bg-green-500 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i < step ? <CheckCircle className="h-4 w-4" /> : i + 1}
            </div>
            <span className={`text-xs ${i === step ? 'font-medium text-gray-900' : 'text-gray-400'}`}>{label}</span>
            {i < STEPS.length - 1 && <div className="h-px w-6 bg-gray-200" />}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          {/* Step 1: Business Info */}
          {step === 0 && (
            <form onSubmit={form1.handleSubmit(onStep1Submit)} className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Tell us about your business</h2>

              <Input
                label="Business name"
                placeholder="Tech Fix Ltd"
                error={form1.formState.errors.businessName?.message}
                {...form1.register('businessName')}
              />

              <div>
                <Input
                  label="Subdomain"
                  placeholder="techfix"
                  error={form1.formState.errors.subdomain?.message}
                  hint={subdomainAvailable === null ? 'Your URL: [subdomain].repairbooking.co.uk' :
                    subdomainAvailable ? '✓ Available!' : '✗ Already taken'}
                  {...form1.register('subdomain', {
                    onChange: (e) => checkSubdomain(e.target.value),
                  })}
                />
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
                Continue
              </Button>

              <p className="text-center text-sm text-gray-500">
                Already have an account?{' '}
                <Link href="/login" className="text-blue-600 hover:underline font-medium">Sign in</Link>
              </p>
            </form>
          )}

          {/* Step 2: Account Setup */}
          {step === 1 && (
            <form onSubmit={form2.handleSubmit(onStep2Submit)} className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Create your account</h2>

              <Input
                label="Your full name"
                placeholder="John Smith"
                error={form2.formState.errors.fullName?.message}
                {...form2.register('fullName')}
              />

              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                error={form2.formState.errors.password?.message}
                {...form2.register('password')}
              />

              <Input
                label="Confirm password"
                type="password"
                placeholder="••••••••"
                error={form2.formState.errors.confirmPassword?.message}
                {...form2.register('confirmPassword')}
              />

              <Input
                label="Main branch name"
                placeholder="Main Store"
                error={form2.formState.errors.mainBranchName?.message}
                {...form2.register('mainBranchName')}
              />

              {serverError && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</div>
              )}

              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button type="submit" className="flex-1" loading={form2.formState.isSubmitting}>
                  Create account
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
