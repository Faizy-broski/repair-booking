'use client'
import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, Loader2, AlertTriangle, ArrowRight, Copy, Check } from 'lucide-react'

function RegisterSuccessContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const directSubdomain = searchParams.get('subdomain')

  const [status, setStatus] = useState<'polling' | 'ready' | 'timeout'>(directSubdomain ? 'ready' : 'polling')
  const [subdomain, setSubdomain] = useState<string | null>(directSubdomain)
  const [copied, setCopied] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const [redirecting, setRedirecting] = useState(false)

  const poll = useCallback(async (attempt: number) => {
    if (directSubdomain) return // Skip polling if we came directly
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
  }, [sessionId, directSubdomain])

  useEffect(() => {
    if (!directSubdomain) {
      poll(0)
    }
  }, [poll, directSubdomain])

  // ── Build the login URL ──
  const [loginUrl, setLoginUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!subdomain) return

    // Default values
    let protocol = 'https'
    let root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'repairbooking.co.uk'

    // Localhost detection
    if (typeof window !== 'undefined') {
      const host = window.location.host
      if (host.includes('localhost') || host.includes('127.0.0.1')) {
        protocol = window.location.protocol.replace(':', '')
        root = 'localhost:3000' // Ensure it points to the local port
      }
    }

    setLoginUrl(`${protocol}://${subdomain}.${root}/login`)
  }, [subdomain])

  // ── Auto-redirect ──
  useEffect(() => {
    if (status === 'ready' && loginUrl && !redirecting) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer)
            setRedirecting(true)
            window.location.href = loginUrl
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [status, loginUrl, redirecting])

  function copyUrl() {
    if (!loginUrl) return
    navigator.clipboard.writeText(loginUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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
            We&rsquo;re creating your account and configuring your modules.
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
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-container/30">
            <CheckCircle className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-on-surface mb-2">
            You&rsquo;re all set!
          </h2>
          <p className="text-on-surface-variant text-sm mb-6 leading-relaxed">
            Your dedicated workspace is ready. Use your login URL below to access your dashboard.
          </p>

          {/* Login URL box */}
          {loginUrl && (
            <div className="mb-6 rounded-xl border border-primary/30 bg-primary-container/10 p-4">
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-2">
                Your Login URL
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-outline-variant/40 bg-surface px-3 py-2.5">
                <span className="flex-1 truncate text-sm font-semibold text-primary select-all text-left">
                  {loginUrl}
                </span>
                <button
                  onClick={copyUrl}
                  className="shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  {copied
                    ? <><Check className="h-3.5 w-3.5 text-primary" /> Copied</>
                    : <><Copy className="h-3.5 w-3.5" /> Copy</>
                  }
                </button>
              </div>
              <p className="mt-2 text-xs text-on-surface-variant">
                Log in with the email &amp; password you chose during registration.
              </p>
            </div>
          )}

          {/* Steps reminder */}
          <div className="rounded-xl bg-surface-container border border-outline-variant/30 p-5 mb-6 text-left space-y-3">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-3">
              What&rsquo;s next
            </p>
            {[
              'Open your login URL and sign in',
              'Complete your business profile',
              'Add your staff and assign roles',
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

          <a
            href={loginUrl ?? '#'}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary-dim px-6 py-3 text-sm font-bold text-on-primary transition-colors"
          >
            {redirecting ? 'Redirecting...' : `Go to your login page (${countdown}s)`} <ArrowRight className="h-4 w-4" />
          </a>
          <p className="mt-4 text-xs text-on-surface-variant italic">
            You will be automatically redirected to your dashboard in {countdown} seconds.
          </p>
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
