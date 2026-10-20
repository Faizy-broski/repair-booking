'use client'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react'

/**
 * Stripe Checkout cancel_url for new registrations (and fallback when the
 * checkout session couldn't be created). The account already exists but is
 * locked until a plan is paid for — logging in lands on /account/plans.
 */
function PaymentCancelledContent() {
  const searchParams = useSearchParams()
  const subdomain = searchParams.get('subdomain')
  const email = searchParams.get('email')
  const failedToStart = searchParams.get('error') === '1'

  function goToLogin() {
    if (!subdomain) return
    let protocol = 'https'
    let root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'repairbooking.co.uk'
    const host = window.location.host
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      protocol = window.location.protocol.replace(':', '')
      root = 'localhost:3000'
    }
    const params = new URLSearchParams({ redirectTo: '/account/plans', ...(email ? { email } : {}) })
    window.location.href = `${protocol}://${subdomain}.${root}/login?${params}`
  }

  return (
    <div className="mx-auto max-w-md text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-yellow-light">
        <AlertTriangle className="h-8 w-8 text-brand-yellow-dark" />
      </div>
      <h2 className="text-2xl font-bold text-on-surface mb-2">
        {failedToStart ? 'We couldn’t start checkout' : 'Payment not completed'}
      </h2>
      <p className="text-on-surface-variant text-sm mb-6 leading-relaxed">
        Your account has been created and saved, but it stays locked until you choose a plan and pay.
        Sign in any time to finish — you&rsquo;ll be taken straight to plan selection.
      </p>

      {subdomain ? (
        <button
          type="button"
          onClick={goToLogin}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary-dim px-6 py-3 text-sm font-bold text-on-primary transition-colors"
        >
          Sign in and choose a plan <ArrowRight className="h-4 w-4" />
        </button>
      ) : (
        <p className="text-xs text-on-surface-variant">
          Use the login link in your welcome email to sign in and complete payment.
        </p>
      )}
    </div>
  )
}

export default function PaymentCancelledPage() {
  return (
    <Suspense fallback={
      <div className="mx-auto flex max-w-md items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <PaymentCancelledContent />
    </Suspense>
  )
}
