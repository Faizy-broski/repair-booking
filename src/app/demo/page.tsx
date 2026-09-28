import type { Metadata } from "next";
import { Calendar, ShieldCheck, Sparkles, Users } from "lucide-react";
import PageShell from "@/components/pages/PageShell";
import PageHero from "@/components/pages/PageHero";
import { FadeIn } from "@/components/landing/motion";
import { LeadForm } from "@/components/marketing/lead-form";

export const metadata: Metadata = {
  title: "Book a Demo | iRepairly",
  description: "Book a 20-minute demo with the iRepairly team and see the platform walked through live.",
  alternates: { canonical: "/demo" },
};

const HIGHLIGHTS = [
  { icon: Calendar, text: "20 minutes, on your schedule" },
  { icon: Users, text: "Tailored to your shop type" },
  { icon: ShieldCheck, text: "No pressure, no obligation" },
];

export default function DemoPage() {
  return (
    <PageShell>
      <PageHero
        icon={Sparkles}
        kicker="Book a Demo"
        title="See iRepairly running your shop."
        description="Tell us a bit about your business and we'll set up a 20-minute walkthrough tailored to how you work."
        primaryCtaHref="/register"
        secondaryCtaLabel="Contact Us Instead"
        secondaryCtaHref="/contact"
      />

      <section className="bg-white px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-4xl gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <FadeIn className="space-y-6">
            <h2 className="text-2xl font-bold tracking-[-0.02em] text-slate-950">
              What to expect
            </h2>
            <p className="text-sm leading-7 text-slate-600 sm:text-base">
              A member of our team will walk you through the modules relevant to your
              business — tickets, POS, inventory, or whatever you're evaluating — and
              answer any questions about migrating your existing data.
            </p>
            <ul className="space-y-3">
              {HIGHLIGHTS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-brand-teal">
                    <Icon className="h-4 w-4" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </FadeIn>

          <FadeIn delay={0.05} className="rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:p-8">
            <h3 className="mb-5 text-lg font-bold text-slate-950">Request your demo</h3>
            <LeadForm
              source="demo_request"
              submitLabel="Request Demo"
              successMessage="Thanks — we'll email you shortly to schedule your demo."
            />
          </FadeIn>
        </div>
      </section>
    </PageShell>
  );
}
