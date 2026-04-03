'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Wrench, Mail, KeyRound, Loader2, AlertCircle } from 'lucide-react'

export default function PortalLoginPage() {
  const router = useRouter()
  const [subdomain, setSubdomain] = useState('')
  const [businessName, setBusinessName] = useState('Customer Portal')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const host = window.location.hostname
    // Works as techfix.repairpos.tech/portal or via ?subdomain= query
    const sub = new URLSearchParams(window.location.search).get('subdomain')
      ?? host.split('.')[0]
    setSubdomain(sub)

    // Optionally fetch business name for branding
    if (sub && sub !== 'localhost') {
      fetch(`/api/public/service-prices?subdomain=${sub}`)
        .then((r) => r.json())
        .then((j) => { if (j.data?.business?.name) setBusinessName(j.data.business.name) })
        .catch(() => {})
    }
  }, [])

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await fetch('/api/portal/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, subdomain }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Something went wrong'); setLoading(false); return }
    setStep('otp')
    setLoading(false)
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await fetch('/api/portal/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, subdomain, otp }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Invalid code'); setLoading(false); return }
    // Store token and redirect
    sessionStorage.setItem('portal_token', json.token)
    sessionStorage.setItem('portal_subdomain', subdomain)
    router.push('/portal/dashboard')
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg">
            <Wrench className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{businessName}</h1>
          <p className="text-sm text-gray-500 mt-1">Customer Portal</p>
        </div>

        <div className="rounded-2xl bg-white shadow-lg border border-gray-100 p-6">
          {step === 'email' ? (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Sign in</h2>
                <p className="text-sm text-gray-500 mt-0.5">We'll send a 6-digit code to your email</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full rounded-lg border border-gray-300 pl-10 pr-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />{error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Enter your code</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Sent to <strong>{email}</strong>
                  <button type="button" onClick={() => { setStep('email'); setOtp(''); setError('') }} className="ml-2 text-blue-600 hover:underline text-xs">Change</button>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">6-digit code</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full rounded-lg border border-gray-300 pl-10 pr-3 py-2.5 text-sm tracking-widest focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />{error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify & Sign In'}
              </button>
              <button
                type="button"
                onClick={() => handleEmailSubmit({ preventDefault: () => {} } as React.FormEvent)}
                className="w-full text-sm text-gray-500 hover:text-blue-600"
              >
                Resend code
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
