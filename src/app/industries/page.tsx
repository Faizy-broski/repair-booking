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
  title: "Software for Every Repair Industry",
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
          <div className="mx-auto mb-10 max-w-3xl text-center sm:mb-14">
            <h2 className="text-2xl font-medium tracking-[-0.02em] text-slate-950 sm:text-4xl">
              Repair software for every trade
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              iRepairly is not only for phone repair. Each industry page shows how the platform fits a different trade,
              including {industryPages.slice(0, -1).map((i) => i.name.toLowerCase()).join(", ")} and{" "}
              {industryPages[industryPages.length - 1].name.toLowerCase()}. Whatever you repair, the same core tools
              apply: custom intake fields for each item, ticket stages that match your workflow, stock tracking for
              parts, and automatic updates so customers always know where their repair stands. Pick your trade below
              to see the common problems it faces and how a typical job moves from check-in to collection.
            </p>
          </div>
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

      <CtaSection heading="Try it in your industry." scriptWord="industry." />
    </PageShell>
  );
}
