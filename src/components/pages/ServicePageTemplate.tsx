import { AlertTriangle } from "lucide-react";
import PageShell from "@/components/pages/PageShell";
import PageHero from "@/components/pages/PageHero";
import BenefitsGrid from "@/components/pages/BenefitsGrid";
import FaqSection from "@/components/pages/FaqSection";
import CtaSection from "@/components/pages/CtaSection";
import RelatedLinks from "@/components/pages/RelatedLinks";
import { FadeIn, Stagger, StaggerItem } from "@/components/landing/motion";
import type { ServicePage } from "@/lib/footer-pages";

export default function ServicePageTemplate({ page }: { page: ServicePage }) {
  return (
    <PageShell>
      <PageHero
        icon={page.icon}
        kicker={page.kicker}
        title={page.tagline}
        description={page.description}
      />

      {/* Pain points */}
      <section className="bg-slate-50/60 px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <FadeIn className="mb-10 sm:mb-14">
            <h2 className="max-w-2xl text-2xl font-medium tracking-[-0.02em] text-slate-950 sm:text-4xl">
              The challenges {page.name.toLowerCase()} buyers face
            </h2>
          </FadeIn>

          <Stagger className="grid gap-5 sm:grid-cols-3 sm:gap-6">
            {page.painPoints.map((point) => (
              <StaggerItem key={point.title}>
                <div className="h-full rounded-[1.5rem] bg-white p-6 shadow-[0_10px_35px_rgba(15,23,42,0.05)]">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-500">
                    <AlertTriangle className="h-4 w-4" strokeWidth={2} />
                  </div>
                  <h3 className="mt-4 text-sm font-bold text-slate-950">{point.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">{point.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <BenefitsGrid heading="How iRepairly helps" benefits={page.howWeHelp} />

      {/* Workflow */}
      <section className="bg-slate-50/60 px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <FadeIn className="mb-10 text-center sm:mb-14">
            <h2 className="text-2xl font-medium tracking-[-0.02em] text-slate-950 sm:text-4xl">
              A typical workflow
            </h2>
          </FadeIn>

          <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6">
            {page.workflow.map((step, index) => (
              <StaggerItem key={step.title}>
                <div className="h-full rounded-[1.5rem] bg-white p-6 shadow-[0_10px_35px_rgba(15,23,42,0.05)]">
                  <span className="text-xs font-bold text-brand-teal">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-2 text-sm font-bold text-slate-950">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">{step.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <FaqSection heading={`${page.name} FAQs`} faqs={page.faqs} />

      <CtaSection
        heading={`Run your business smarter.`}
        scriptWord="smarter."
      />

      <RelatedLinks heading="Related services & tools" links={page.related} />
    </PageShell>
  );
}
