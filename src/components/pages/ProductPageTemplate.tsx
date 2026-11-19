import PageShell from "@/components/pages/PageShell";
import PageHero from "@/components/pages/PageHero";
import BenefitsGrid from "@/components/pages/BenefitsGrid";
import UseCasesSection from "@/components/pages/UseCasesSection";
import FaqSection from "@/components/pages/FaqSection";
import CtaSection from "@/components/pages/CtaSection";
import RelatedLinks from "@/components/pages/RelatedLinks";
import type { CapabilityPage } from "@/lib/footer-pages";

export default function ProductPageTemplate({ page }: { page: CapabilityPage }) {
  return (
    <PageShell>
      <PageHero
        icon={page.icon}
        kicker={page.kicker}
        title={page.tagline}
        description={page.description}
      />

      <BenefitsGrid heading={`Why shops use ${page.name}`} benefits={page.benefits} />

      <UseCasesSection heading={`Where ${page.name} fits into your day`} items={page.useCases} />

      <FaqSection heading={`${page.name} FAQs`} faqs={page.faqs} />

      <CtaSection heading={`Try ${page.name} free.`} scriptWord="free." />

      <RelatedLinks heading={`Products related to ${page.name}`} links={page.related} />
    </PageShell>
  );
}
