import Link from 'next/link'
import { Mail, Clock, Phone } from 'lucide-react'

export default function EnterpriseSuccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-10 shadow-sm border border-outline-variant/30 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary-container">
          <Mail className="h-8 w-8 text-on-primary-container" />
        </div>

        <h1 className="text-2xl font-bold text-on-surface mb-2">Enquiry received!</h1>
        <p className="text-on-surface-variant text-sm mb-8 leading-relaxed">
          Thanks for your interest in our Enterprise plan. Our sales team will be in touch within 1 business day.
        </p>

        <div className="space-y-3 mb-8">
          {[
            { icon: Mail,  label: 'Confirmation email sent', desc: 'Check your inbox for a copy of your enquiry' },
            { icon: Clock, label: 'Response within 1 business day', desc: 'Our team will reach out to discuss your needs' },
            { icon: Phone, label: 'Custom pricing & onboarding', desc: 'Tailored to your branch count and requirements' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-3 rounded-xl border border-outline-variant/30 bg-surface-container px-4 py-3 text-left">
              <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-on-surface">{label}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-on-surface-variant mb-6">
          Need to reach us sooner?{' '}
          <a href="mailto:sales@repairbooking.co.uk" className="text-primary hover:underline">
            sales@repairbooking.co.uk
          </a>
        </p>

        <Link
          href="/"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-outline-variant hover:bg-surface-container px-6 py-3 text-sm font-medium text-on-surface transition-colors"
        >
          Back to homepage
        </Link>
      </div>
    </div>
  )
}
