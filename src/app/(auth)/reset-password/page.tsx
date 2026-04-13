'use client'
import { Suspense, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@/lib/zod-resolver'
import { z } from 'zod'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { ShieldAlert, ArrowLeft } from 'lucide-react'

const schema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  })
type FormData = z.infer<typeof schema>

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="w-full max-w-md mx-auto">
        <Card>
          <CardContent className="pt-6">
            <div className="h-48 animate-pulse rounded-xl bg-surface-container" />
          </CardContent>
        </Card>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}

function ResetPasswordForm() {
  const router = useRouter()
  // null = checking, true = valid session, false = no session
  const [sessionReady, setSessionReady] = useState<boolean | null>(null)
  const [serverError, setServerError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionReady(!!session)
    })
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setServerError('')
    const supabase = createClient()

    const { error } = await supabase.auth.updateUser({ password: data.password })

    if (error) {
      // "same password as current" scenario
      if (error.message.toLowerCase().includes('same password')) {
        setServerError('New password must be different from your current password.')
        return
      }
      // Session expired while the user was on this page
      if (
        error.message.toLowerCase().includes('session') ||
        error.message.toLowerCase().includes('expired') ||
        error.status === 401
      ) {
        setServerError('Your reset link has expired. Please request a new one.')
        return
      }
      setServerError(error.message || 'Something went wrong. Please try again.')
      return
    }

    // Sign out after successful password change so stale sessions are cleared,
    // then redirect to login with a success message.
    await supabase.auth.signOut()
    router.replace('/login?message=password_reset')
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (sessionReady === null) {
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

  // ── Invalid / expired link ─────────────────────────────────────────────────
  if (!sessionReady) {
    return (
      <div className="w-full max-w-md mx-auto">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <ShieldAlert className="h-6 w-6 text-red-600" />
              </div>
              <h2 className="text-xl font-semibold text-on-surface">Link expired</h2>
              <p className="text-sm text-on-surface-variant">
                This password reset link is invalid or has expired (links are valid
                for&nbsp;1&nbsp;hour). Please request a new one.
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <Link href="/forgot-password" className="w-full">
                <Button className="w-full">Request new link</Button>
              </Link>
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

  // ── Reset form ─────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-md mx-auto">
      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-1 text-xl font-semibold text-on-surface">Set new password</h2>
          <p className="mb-5 text-sm text-on-surface-variant">
            Choose a strong password for your account.
          </p>

          {serverError && (
            <div className="mb-4 rounded-lg border border-error-container/40 bg-error-container/15 px-4 py-3 text-sm text-on-error-container">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="New password"
              type="password"
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              error={errors.password?.message}
              hint="At least 8 characters with uppercase, lowercase and a number"
              {...register('password')}
            />

            <Input
              label="Confirm new password"
              type="password"
              placeholder="Repeat your password"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            <Button type="submit" className="w-full" loading={isSubmitting}>
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
