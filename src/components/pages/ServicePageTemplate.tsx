import { AlertTriangle } from "lucide-react";
import PageShell from "@/components/pages/PageShell";
import PageHero from "@/components/pages/PageHero";
import BenefitsGrid from "@/components/pages/BenefitsGrid";
import FaqSection from "@/components/pages/FaqSection";
import CtaSection from "@/components/pages/CtaSection";
import RelatedLinks from "@/components/pages/RelatedLinks";
import { FadeIn, Stagger, StaggerItem } from "@/components/landing/motion";
import { ArticleContent } from "@/components/pages/ArticlePageTemplate";
import { serviceArticlePages, type ServicePage } from "@/lib/footer-pages";

export default function ServicePageTemplate({ page }: { page: ServicePage }) {
  const article = serviceArticlePages.find((a) => a.cluster === page.cluster);

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

      <BenefitsGrid heading={`How RepairBooking helps with ${page.name.toLowerCase()}`} benefits={page.howWeHelp} />

      {/* Workflow */}
      <section className="bg-slate-50/60 px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <FadeIn className="mb-10 text-center sm:mb-14">
            <h2 className="text-2xl font-medium tracking-[-0.02em] text-slate-950 sm:text-4xl">
              A typical {page.name.toLowerCase()} workflow
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

      {page.moreAbout && page.moreAbout.length > 0 && (
        <section className="bg-white px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <FadeIn className="mb-10 sm:mb-14">
              <h2 className="max-w-2xl text-2xl font-medium tracking-[-0.02em] text-slate-950 sm:text-4xl">
                More about {page.name.toLowerCase()}
              </h2>
            </FadeIn>

            <Stagger className="grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              {page.moreAbout.map((item) => (
                <StaggerItem key={item.title}>
                  <div className="h-full rounded-[1.5rem] bg-slate-50/60 p-6">
                    <h3 className="text-sm font-bold text-slate-950">{item.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-slate-600">{item.text}</p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>
      )}

      {article && (
        <>
          <section className="bg-white px-4 pb-8 pt-16 sm:px-6 sm:pb-10 sm:pt-24 lg:px-8">
            <FadeIn className="mx-auto max-w-6xl">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-teal">
                {article.kicker}
              </p>
              <h2 className="mt-3 max-w-3xl text-3xl font-medium tracking-[-0.03em] text-slate-950 sm:text-5xl sm:leading-[1.1]">
                {article.title}
              </h2>
            </FadeIn>
          </section>
          <ArticleContent page={article} includeLead />
        </>
      )}

      <FaqSection heading={`${page.name} FAQs`} faqs={page.faqs} />

      <CtaSection
        heading={`Try ${page.name} free.`}
        scriptWord="free."
      />

      <RelatedLinks heading={`Services related to ${page.name}`} links={page.related} />
    </PageShell>
  );
}
