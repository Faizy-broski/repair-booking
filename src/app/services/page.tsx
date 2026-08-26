import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, LayoutGrid } from "lucide-react";
import PageShell from "@/components/pages/PageShell";
import PageHero from "@/components/pages/PageHero";
import CtaSection from "@/components/pages/CtaSection";
import { Stagger, StaggerItem } from "@/components/landing/motion";
import { Card } from "@/components/ui/card";
import { servicePages } from "@/lib/footer-pages";

export const metadata: Metadata = {
  title: "All Services | iRepairly",
  description:
    "iRepairly powers auto repair, garage and workshop management, dealerships, mobile repair shops, and booking & POS workflows. Explore every service we support.",
  keywords: ["repair software services", "repair shop solutions", "services supported"],
  alternates: { canonical: "/services" },
};

export default function AllServicesPage() {
  return (
    <PageShell>
      <PageHero
        icon={LayoutGrid}
        kicker="All Services"
        title="Software built for every corner of the repair business."
        description="From the workshop floor to the front counter, iRepairly adapts to how your business runs. Explore every service we support."
      />

      <section className="bg-white px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Stagger className="grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {servicePages.map((service) => (
              <StaggerItem key={service.slug}>
                <Link href={`/services/${service.slug}`}>
                  <Card className="group h-full rounded-[1.75rem] border-0 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
                    <div className="flex items-start justify-between">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-white">
                        <service.icon className="h-5 w-5" strokeWidth={1.8} />
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-slate-400 transition-colors group-hover:text-brand-teal" />
                    </div>
                    <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-brand-teal">
                      {service.cluster}
                    </p>
                    <h3 className="mt-1.5 text-sm font-bold tracking-[-0.02em] text-slate-950">
                      {service.name}
                    </h3>
                    <p className="mt-1.5 text-sm leading-6 text-slate-600">{service.tagline}</p>
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
