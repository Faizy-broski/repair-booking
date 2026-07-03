import { AlertTriangle } from "lucide-react";
import PageShell from "@/components/pages/PageShell";
import PageHero from "@/components/pages/PageHero";
import RelatedLinks from "@/components/pages/RelatedLinks";
import { FadeIn } from "@/components/landing/motion";
import type { LegalPage } from "@/lib/footer-pages";

export default function LegalPageTemplate({ page }: { page: LegalPage }) {
  const [disclaimer, ...sections] = page.sections;

  return (
    <PageShell>
      <PageHero
        icon={page.icon}
        kicker={`Legal · Last updated ${page.lastUpdated}`}
        title={page.name}
        description={page.summary}
        primaryCtaLabel="Contact Us"
        primaryCtaHref="/company/contact-us"
        secondaryCtaLabel="Back to Legal"
        secondaryCtaHref="/company/privacy-policy"
      />

      <section className="bg-white px-4 pb-14 sm:px-6 sm:pb-20 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <FadeIn className="mb-10 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm leading-6">{disclaimer.body[0]}</p>
          </FadeIn>

          <div className="space-y-8">
            {sections.map((section) => (
              <FadeIn key={section.heading}>
                <h2 className="text-lg font-bold tracking-[-0.02em] text-slate-950">
                  {section.heading}
                </h2>
                <div className="mt-3 space-y-3">
                  {section.body.map((paragraph, i) => (
                    <p key={i} className="text-sm leading-7 text-slate-600">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <RelatedLinks heading="Other legal documents" links={page.related} />
    </PageShell>
  );
}
