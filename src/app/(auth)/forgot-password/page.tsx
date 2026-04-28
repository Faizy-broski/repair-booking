'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle, ArrowLeft, Mail } from 'lucide-react'

const schema = z.object({
  email: z.string().email('Invalid email address'),
})
type FormData = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState('')

  const { register, handleSubmit, getValues, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setServerError('')
    const supabase = createClient()

    // Clear any existing session so a stale auth state on this device cannot
    // cause getUser()/getSession() on the reset page to return a false positive.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})

    // Always redirect to the root domain callback — this URL must be registered
    // in Supabase Dashboard → Authentication → URL Configuration → Redirect URLs.
    //
    // Priority:
    //  1. NEXT_PUBLIC_APP_URL  (set on Vercel as https://repairbooking.co.uk)
    //  2. Derived from ROOT_DOMAIN env var
    //  3. Hard-coded production fallback (safe — only used in production build)
    //
    // NEVER derive from window.location because the user may be visiting from a
    // tenant subdomain (e.g. techfix.repairbooking.co.uk) which is NOT registered
    // as a Supabase redirect URL, causing the code to land on /?code=... instead.
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NEXT_PUBLIC_ROOT_DOMAIN ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}` : null) ||
      'https://repairbooking.co.uk'
    const redirectTo = `${appUrl}/api/auth/callback?next=/reset-password`

    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo,
    })

    if (error) {
      // Rate limit hit — surface this clearly so users don't keep trying
      if (error.message.toLowerCase().includes('rate limit') || error.status === 429) {
        setServerError(
          'Too many reset requests. Please wait a few minutes before trying again.'
        )
        return
      }
      setServerError('Something went wrong. Please try again.')
      return
    }

    // Always show the same confirmation screen regardless of whether the email
    // exists — prevents account enumeration.
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="w-full max-w-md mx-auto">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-on-surface">Check your email</h2>
              <p className="text-sm text-on-surface-variant">
                If an account exists for{' '}
                <span className="font-medium text-on-surface">{getValues('email')}</span>,
                you will receive a password reset link shortly.
              </p>
              <p className="text-xs text-on-surface-variant">
                The link expires in 1 hour. Check your spam folder if you don&apos;t
                see it within a few minutes.
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setSubmitted(false)}
              >
                <Mail className="mr-2 h-4 w-4" />
                Send again
              </Button>
              <Link href="/login" className="w-full">
                <Button variant="ghost" className="w-full">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to sign in
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-1 text-xl font-semibold text-on-surface">Forgot password?</h2>
          <p className="mb-5 text-sm text-on-surface-variant">
            Enter your email address and we&apos;ll send you a reset link.
          </p>

          {serverError && (
            <div className="mb-4 rounded-lg border border-error-container/40 bg-error-container/15 px-4 py-3 text-sm text-on-error-container">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />

            <Button type="submit" className="w-full" loading={isSubmitting}>
              Send reset link
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
