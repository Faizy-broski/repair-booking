import PageShell from "@/components/pages/PageShell";
import PageHero from "@/components/pages/PageHero";
import FaqSection from "@/components/pages/FaqSection";
import CtaSection from "@/components/pages/CtaSection";
import RelatedLinks from "@/components/pages/RelatedLinks";
import { FadeIn } from "@/components/landing/motion";
import type { CompanyPage } from "@/lib/footer-pages";

export default function CompanyPageTemplate({ page }: { page: CompanyPage }) {
  return (
    <PageShell>
      <PageHero
        icon={page.icon}
        kicker={page.kicker}
        title={page.tagline}
        description={page.description}
      />

      <section className="bg-white px-4 pb-14 sm:px-6 sm:pb-20 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-10 sm:space-y-14">
          {page.sections.map((section) => (
            <FadeIn key={section.heading}>
              <h2 className="text-xl font-bold tracking-[-0.02em] text-slate-950 sm:text-2xl">
                {section.heading}
              </h2>
              <div className="mt-3 space-y-4">
                {section.body.map((paragraph, i) => (
                  <p key={i} className="text-sm leading-7 text-slate-600 sm:text-base">
                    {paragraph}
                  </p>
                ))}
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {page.faqs && <FaqSection faqs={page.faqs} />}

      <CtaSection />

      <RelatedLinks links={page.related} />
    </PageShell>
  );
}
