import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Globe } from "lucide-react";
import PageShell from "@/components/pages/PageShell";
import PageHero from "@/components/pages/PageHero";
import CtaSection from "@/components/pages/CtaSection";
import { Stagger, StaggerItem } from "@/components/landing/motion";
import { Card } from "@/components/ui/card";
import { industryPages } from "@/lib/footer-pages";

export const metadata: Metadata = {
  title: "All Industries | iRepairly",
  description:
    "iRepairly powers repair businesses across electronics, vehicles, sporting goods, and specialist trades. Explore every industry we support.",
  keywords: ["repair software industries", "repair business types", "industries supported"],
  alternates: { canonical: "/industries" },
};

export default function AllIndustriesPage() {
  return (
    <PageShell>
      <PageHero
        icon={Globe}
        kicker="All Industries"
        title="Purpose-built for repair trades of every kind."
        description="From mobile phones to musical instruments, iRepairly adapts to how your specific trade works. Explore every industry we support."
      />

      <section className="bg-white px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Stagger className="grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
            {industryPages.map((industry) => (
              <StaggerItem key={industry.slug}>
                <Link href={`/industries/${industry.slug}`}>
                  <Card className="group h-full rounded-[1.75rem] border-0 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
                    <div className="flex items-start justify-between">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-white">
                        <industry.icon className="h-5 w-5" strokeWidth={1.8} />
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-slate-400 transition-colors group-hover:text-brand-teal" />
                    </div>
                    <h3 className="mt-5 text-sm font-bold tracking-[-0.02em] text-slate-950">
                      {industry.name}
                    </h3>
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
