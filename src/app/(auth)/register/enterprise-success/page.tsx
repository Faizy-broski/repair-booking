import Link from 'next/link'
import { Mail, Clock, Phone } from 'lucide-react'

export default function EnterpriseSuccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-sm border border-gray-100 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-teal-light">
          <Mail className="h-8 w-8 text-brand-teal" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Enquiry received!</h1>
        <p className="text-gray-500 text-sm mb-8 leading-relaxed">
          Thanks for your interest in our Enterprise plan. Our sales team will be in touch within 1 business day.
        </p>

        <div className="space-y-3 mb-8">
          {[
            { icon: Mail,  label: 'Confirmation email sent', desc: 'Check your inbox for a copy of your enquiry' },
            { icon: Clock, label: 'Response within 1 business day', desc: 'Our team will reach out to discuss your needs' },
            { icon: Phone, label: 'Custom pricing & onboarding', desc: 'Tailored to your branch count and requirements' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-left">
              <Icon className="h-5 w-5 text-brand-teal shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-gray-900">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 mb-6">
          Need to reach us sooner?{' '}
          <a href="mailto:sales@repairbooking.co.uk" className="text-brand-teal hover:underline">
            sales@repairbooking.co.uk
          </a>
        </p>

        <Link
          href="/"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 hover:bg-gray-50 px-6 py-3 text-sm font-medium text-gray-700 transition-colors"
        >
          Back to homepage
        </Link>
      </div>
    </div>
  )
}
