import Link from 'next/link'
import { CheckCircle, Mail, ArrowRight } from 'lucide-react'

export default function RegisterSuccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-sm border border-gray-100 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment confirmed!</h1>
        <p className="text-gray-500 text-sm mb-8 leading-relaxed">
          Your account is being activated. You'll receive a welcome email with your login credentials within a few minutes.
        </p>

        <div className="rounded-xl bg-brand-teal-light border border-brand-teal-light p-4 mb-8 text-left space-y-3">
          <div className="flex items-start gap-3">
            <Mail className="h-5 w-5 text-brand-teal shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-brand-teal-dark">Check your email</p>
              <p className="text-xs text-brand-teal mt-0.5">
                We've sent your dashboard URL, email, and password to the address you registered with.
                Check your spam folder if it doesn't arrive within 5 minutes.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 text-left mb-8">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Once you receive the email:</p>
          {[
            'Click the dashboard link in the email',
            'Log in with your email and password',
            'Complete your business profile',
            'Add staff, services, and inventory',
            'Start taking repairs and sales!',
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-teal text-white text-xs font-bold">
                {i + 1}
              </div>
              <span className="text-sm text-gray-600">{step}</span>
            </div>
          ))}
        </div>

        <Link
          href="/login"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-teal hover:bg-brand-teal-dark px-6 py-3 text-sm font-bold text-white transition-colors"
        >
          Go to Login <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
