'use client'
import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getSubdomain } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { useAuthStore } from '@/store/auth.store'
import { useModuleConfigStore } from '@/store/module-config.store'

// Password is always optional at the schema level.
// Manual validation in onSubmit handles the subdomain case.
const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().optional(),
})
type FormData = z.infer<typeof schema>

function checkIsRootDomain(): boolean {
  const hostname = window.location.hostname
  const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'repairbooking.co.uk').split(':')[0]
  return hostname === 'localhost' || hostname === rootDomain || hostname === `www.${rootDomain}`
}

function buildSubdomainOrigin(subdomain: string): string {
  const { protocol, hostname, port } = window.location
  const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'repairbooking.co.uk').split(':')[0]
  const baseHost = hostname === 'localhost'
    ? (port ? `localhost:${port}` : 'localhost')
    : rootDomain
  return `${protocol}//${subdomain}.${baseHost}`
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="w-full max-w-md mx-auto">
        <div className="h-48 animate-pulse rounded-xl bg-surface-container" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const searchParams = useSearchParams()
  const prefilledEmail = searchParams.get('email') ?? ''
  const redirectTo = searchParams.get('redirectTo') || '/dashboard'
  const errorParam = searchParams.get('error')

  const [onRoot, setOnRoot] = useState<boolean | null>(null)  // null = not yet determined
  const [serverError, setServerError] = useState('')
  const [pwError, setPwError] = useState('')
  const [subdomainBusinessId, setSubdomainBusinessId] = useState<string | null>(null)
  const { setProfile, clear: clearAuthStore } = useAuthStore()
  const { invalidate: invalidateModuleConfig } = useModuleConfigStore()

  useEffect(() => {
    const isRoot = checkIsRootDomain()
    setOnRoot(isRoot)
    // When landing on the admin subdomain, eagerly wipe any stale tenant store
    // data from localStorage (shared origin with tenant subdomains on localhost).
    if (!isRoot && window.location.hostname.startsWith('admin.')) {
      clearAuthStore()
      invalidateModuleConfig()
    }
    // Pre-fetch this subdomain's business ID so the cross-tenant check
    // after sign-in is instant (no DB round-trip in the critical path).
    if (!isRoot) {
      const sub = getSubdomain(window.location.hostname)
      if (sub) {
        const supabase = createClient()
        supabase
          .from('businesses')
          .select('id')
          .eq('subdomain', sub)
          .maybeSingle()
          .then(({ data }) => { if (data) setSubdomainBusinessId(data.id) })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: prefilledEmail },
  })

  async function onSubmit(data: FormData) {
    setServerError('')
    setPwError('')

    // ── ROOT DOMAIN: discover subdomain, redirect for authentication ──────────
    if (onRoot) {
      const res = await fetch('/api/auth/find-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email }),
      })
      const json = await res.json() as { subdomain: string | null; isSuperAdmin?: boolean; suspended?: boolean }

      if (json.isSuperAdmin) {
        // Super admins authenticate on the admin subdomain via the shared /login page
        const params = new URLSearchParams({ redirectTo: '/superadmin/dashboard', email: data.email })
        window.location.href = `${buildSubdomainOrigin('admin')}/login?${params}`
        return
      }

      if (json.suspended) {
        setServerError('This business account has been suspended. Please contact support@repairbooking.co.uk.')
        return
      }

      if (!json.subdomain) {
        setServerError('No account found for this email. Please check your email or register a new business.')
        return
      }

      // Redirect to the tenant subdomain login — auth happens there so cookies are
      // scoped to the correct origin from the start.
      const params = new URLSearchParams({ redirectTo, email: data.email })
      window.location.href = `${buildSubdomainOrigin(json.subdomain)}/login?${params}`
      return
    }

    // ── SUBDOMAIN: full sign-in happens here ─────────────────────────────────
    if (!data.password || data.password.length < 6) {
      setPwError('Password must be at least 6 characters')
      return
    }

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })

    if (signInError) {
      setServerError(signInError.message)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setServerError('Authentication failed. Please try again.')
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, business_id')
      .eq('id', user.id)
      .single()

    if (profile && (profile as { role: string }).role === 'super_admin') {
      // Clear any lingering tenant store data before entering the admin portal.
      clearAuthStore()
      invalidateModuleConfig()
      // Super admin lives on the admin subdomain
      if (window.location.hostname.startsWith('admin.')) {
        window.location.replace('/superadmin/dashboard')
      } else {
        window.location.href = `${buildSubdomainOrigin('admin')}/superadmin/dashboard`
      }
      return
    }

    // ── Cross-tenant guard (subdomain mode) ───────────────────────────
    // Compare the profile's business_id with the pre-fetched subdomain
    // business ID — this is a synchronous check, no DB query needed.
    if (subdomainBusinessId && profile) {
      if ((profile as { business_id: string }).business_id !== subdomainBusinessId) {
        await supabase.auth.signOut()
        clearAuthStore()
        invalidateModuleConfig()
        setServerError(
          'Invalid credentials. Please sign in using your business credientials.'
        )
        return
      }
    }

    if (profile) {
      setProfile(profile as Parameters<typeof setProfile>[0])
    }

    // Full page navigation — NOT router.push — so the middleware rewrite fires
    // correctly with all auth cookies in the request. router.push after fresh
    // signIn causes RSC fetch to 404 because the rewrite context isn't ready.
    window.location.replace(redirectTo)
  }

  // Show nothing until we know which mode we're in (avoids hydration flash)
  if (onRoot === null) {
    return (
      <div className="w-full max-w-md mx-auto">
        <Card>
          <CardContent className="pt-6">
            <div className="h-48 animate-pulse rounded-xl bg-surface-container" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <Card>
        <CardContent className="pt-6">
        <h2 className="mb-1 text-xl font-semibold text-on-surface">Welcome back</h2>

        {onRoot ? (
          <p className="mb-5 text-sm text-on-surface-variant">
            Enter your email to be redirected to your business login page.
          </p>
        ) : (
          <p className="mb-5 text-sm text-on-surface-variant">Sign in to your account.</p>
        )}

        {/* Account suspended */}
        {errorParam === 'suspended' && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-semibold">Account suspended</p>
            <p className="mt-0.5 text-red-700">
              This business account has been suspended. Please contact{' '}
              <a href="mailto:support@repairbooking.co.uk" className="underline">
                support@repairbooking.co.uk
              </a>{' '}
              to resolve this.
            </p>
          </div>
        )}

        {/* Show cross-tenant error from middleware redirect */}
        {errorParam === 'wrong_tenant' && (
          <div className="rounded-lg border border-error-container/40 bg-error-container/15 px-4 py-3 text-sm text-on-error-container">
            You were signed out because your account does not belong to this business.
            Please sign in with the correct credentials.
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Email address"
            type="email"
            placeholder="you@example.com"
            error={errors.email?.message}
            {...register('email')}
          />

          {/* Password only shown on the tenant subdomain */}
          {!onRoot && (
            <div>
              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                error={pwError || errors.password?.message}
                {...register('password')}
              />
              <div className="mt-1 text-right">
                <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
            </div>
          )}

          {serverError && (
            <div className="rounded-lg border border-error-container/40 bg-error-container/15 px-4 py-3 text-sm text-on-error-container">
              {serverError}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            loading={isSubmitting}
            disabled={errorParam === 'suspended'}
          >
            {onRoot ? 'Continue →' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-on-surface-variant">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Start free trial
          </Link>
        </p>
      </CardContent>
    </Card>
    </div>
  )
}
