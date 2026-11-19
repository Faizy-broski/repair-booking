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

      <BenefitsGrid heading={`${page.name} benefits`} benefits={page.benefits} />

      <UseCasesSection heading={`${page.name} use cases`} items={page.useCases} />

      <FaqSection heading={`${page.name} FAQs`} faqs={page.faqs} />

      <CtaSection
        heading={`Try ${page.name} free.`}
        scriptWord="free."
        description="Every feature is included in every plan — no upsells, no surprises."
      />

      <RelatedLinks heading={`Features related to ${page.name}`} links={page.related} />
    </PageShell>
  );
}
