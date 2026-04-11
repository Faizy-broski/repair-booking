'use client'
import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, Loader2, AlertTriangle, ArrowRight } from 'lucide-react'

function RegisterSuccessContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')

  const [status, setStatus] = useState<'polling' | 'ready' | 'timeout'>('polling')
  const [subdomain, setSubdomain] = useState<string | null>(null)

  const poll = useCallback(async (attempt: number) => {
    if (!sessionId || attempt > 30) {
      setStatus('timeout')
      return
    }
    try {
      const res = await fetch(
        `/api/auth/check-registration?session_id=${encodeURIComponent(sessionId)}`
      )
      const json = await res.json()

      if (json.data?.status === 'ready' && json.data.subdomain) {
        setSubdomain(json.data.subdomain)
        setStatus('ready')
        return
      }
    } catch {
      /* retry */
    }
    setTimeout(() => poll(attempt + 1), 2000)
  }, [sessionId])

  useEffect(() => {
    poll(0)
  }, [poll])

  /* Once ready, build the login URL for the subdomain */
  const rootDomain =
    typeof window !== 'undefined'
      ? window.location.hostname.replace(/^www\./, '') // e.g. "localhost" or "repairpos.tech"
      : ''
  const port = typeof window !== 'undefined' ? window.location.port : ''
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'https:'
  const loginUrl = subdomain
    ? `${protocol}//${subdomain}.${rootDomain}${port ? `:${port}` : ''}/login`
    : null

  return (
    <div className="mx-auto max-w-md text-center">
      {/* ── Polling: setting up ─────────────────────────────────────────── */}
      {status === 'polling' && (
        <>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary-container/30">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-on-surface mb-2">
            Setting up your workspace&hellip;
          </h2>
          <p className="text-on-surface-variant text-sm leading-relaxed">
            Payment received! We&rsquo;re creating your account now.
            <br />
            This usually takes just a few seconds.
          </p>

          {/* Progress dots */}
          <div className="mt-8 flex items-center justify-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2 w-2 rounded-full bg-primary animate-pulse"
                style={{ animationDelay: `${i * 200}ms` }}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Ready: redirect to subdomain login ─────────────────────────── */}
      {status === 'ready' && (
        <>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary-container/30">
            <CheckCircle className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-on-surface mb-2">
            You&rsquo;re all set!
          </h2>
          <p className="text-on-surface-variant text-sm mb-6 leading-relaxed">
            Your workspace{' '}
            <strong className="text-on-surface">{subdomain}</strong> is ready.
            <br />
            Log in with the email and password you chose during registration.
          </p>

          {/* Steps reminder */}
          <div className="rounded-xl bg-surface-container border border-outline-variant/30 p-5 mb-6 text-left space-y-3">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-3">
              What&rsquo;s next
            </p>
            {[
              'Log in with your email & password',
              'Complete your business profile',
              'Add staff, services and inventory',
              'Start taking repairs and sales!',
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary text-xs font-bold">
                  {i + 1}
                </div>
                <span className="text-sm text-on-surface">{step}</span>
              </div>
            ))}
          </div>

          {loginUrl && (
            <a
              href={loginUrl}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary-dim px-6 py-3 text-sm font-bold text-on-primary transition-colors"
            >
              Go to your login page <ArrowRight className="h-4 w-4" />
            </a>
          )}
        </>
      )}

      {/* ── Timeout: fallback ──────────────────────────────────────────── */}
      {status === 'timeout' && (
        <>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-yellow-light">
            <AlertTriangle className="h-8 w-8 text-brand-yellow-dark" />
          </div>
          <h2 className="text-2xl font-bold text-on-surface mb-2">
            Taking longer than expected
          </h2>
          <p className="text-on-surface-variant text-sm mb-6 leading-relaxed">
            Your payment was successful but account setup is still processing.
            You&rsquo;ll receive a <strong>welcome email</strong> shortly with
            your login link. If it doesn&rsquo;t arrive within a few minutes,
            please contact support.
          </p>
        </>
      )}
    </div>
  )
}

export default function RegisterSuccessPage() {
  return (
    <Suspense fallback={
      <div className="mx-auto flex max-w-md items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <RegisterSuccessContent />
    </Suspense>
  )
}
