import PageShell from "@/components/pages/PageShell";
import PageHero from "@/components/pages/PageHero";
import BenefitsGrid from "@/components/pages/BenefitsGrid";
import UseCasesSection from "@/components/pages/UseCasesSection";
import FaqSection from "@/components/pages/FaqSection";
import CtaSection from "@/components/pages/CtaSection";
import RelatedLinks from "@/components/pages/RelatedLinks";
import type { CapabilityPage } from "@/lib/footer-pages";

export default function FeaturePageTemplate({ page }: { page: CapabilityPage }) {
  return (
    <PageShell>
      <PageHero
        icon={page.icon}
        kicker={page.kicker}
        title={page.tagline}
        description={page.description}
      />

      <BenefitsGrid heading="Main benefits" benefits={page.benefits} />

      <UseCasesSection heading="Common use cases" items={page.useCases} />

      <FaqSection faqs={page.faqs} />

      <CtaSection
        heading="Try it in your shop."
        scriptWord="shop."
        description="Every feature is included in every plan during your trial — no upsells, no surprises."
      />

      <RelatedLinks heading="Related features" links={page.related} />
    </PageShell>
  );
}
