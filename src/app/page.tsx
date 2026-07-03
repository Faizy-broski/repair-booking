"use client";

import Nav from "@/components/landing/nav";
import Hero from "@/components/landing/hero";
import FeatureHeroVisual from "@/components/landing/featureHeroVisual";
import TrustedByStrip from "@/components/landing/trustedByStrip";
import PlatformSection from "@/components/landing/platformSection";
import CoreFeaturesSection from "@/components/landing/coreFeaturesSection";
import ModulesSection from "@/components/landing/modulesSection";
import IndustriesCarousel from "@/components/landing/industriesCarousel"
import CustomerStoriesCarousel from "@/components/landing/customerStoriesSection";
import PricingSection from "@/components/landing/pricingSection";
import FAQs from "@/components/landing/faqs";
import StartTrialSection from "@/components/landing/startTrialSection";
import Footer from "@/components/landing/footer";

// ─── Page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <>
      <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-b from-[#eafafa] via-[#f4fbfb] to-white pt-[96px] sm:pt-[104px] lg:pt-[116px]">
        <div className="absolute inset-x-0 top-0 -z-10 flex justify-center">
          <div className="h-[300px] w-[92vw] max-w-[900px] rounded-full bg-cyan-300/30 blur-[120px] sm:h-[550px] sm:blur-[180px]" />
        </div>

        <div className="absolute left-1/2 top-24 -translate-x-1/2 -z-10">
          <div className="h-[250px] w-[80vw] max-w-[700px] rounded-full bg-teal-300/20 blur-[90px] sm:h-[450px] sm:blur-[140px]" />
        </div>

        <Nav />
        <Hero />
      </div>
      <FeatureHeroVisual />
      <TrustedByStrip />
      <PlatformSection />
      <CoreFeaturesSection />
      <ModulesSection />
      <IndustriesCarousel/>
      <CustomerStoriesCarousel />
      <PricingSection />
      <FAQs />
      <StartTrialSection />
      <Footer />
    </>
  );
}
