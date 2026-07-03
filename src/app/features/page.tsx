import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, LayoutGrid } from "lucide-react";
import PageShell from "@/components/pages/PageShell";
import PageHero from "@/components/pages/PageHero";
import CtaSection from "@/components/pages/CtaSection";
import { Stagger, StaggerItem } from "@/components/landing/motion";
import { Card } from "@/components/ui/card";
import { featurePages } from "@/lib/footer-pages";

export const metadata: Metadata = {
  title: "All Features | iRepairly",
  description:
    "Explore every iRepairly feature — from job management and CRM to invoicing, automation, and multi-branch reporting.",
  keywords: ["iRepairly features", "repair shop software features", "all features"],
  alternates: { canonical: "/features" },
};

export default function AllFeaturesPage() {
  return (
    <PageShell>
      <PageHero
        icon={LayoutGrid}
        kicker="All Features"
        title="Everything your repair shop needs, in one platform."
        description="From job management to invoicing, automation, and multi-branch reporting — explore every feature that powers iRepairly."
      />

      <section className="bg-white px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Stagger className="grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {featurePages.map((feature) => (
              <StaggerItem key={feature.slug}>
                <Link href={`/features/${feature.slug}`}>
                  <Card className="group h-full rounded-[1.75rem] border-0 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
                    <div className="flex items-start justify-between">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-white">
                        <feature.icon className="h-5 w-5" strokeWidth={1.8} />
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-slate-400 transition-colors group-hover:text-brand-teal" />
                    </div>
                    <h3 className="mt-5 text-base font-bold tracking-[-0.02em] text-slate-950">
                      {feature.name}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{feature.tagline}</p>
                  </Card>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <CtaSection />
    </PageShell>
  );
}
