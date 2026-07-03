import { Card } from "@/components/ui/card";
import { Stagger, StaggerItem } from "@/components/landing/motion";
import type { BenefitItem } from "@/lib/footer-pages";

export default function BenefitsGrid({
  heading,
  benefits,
}: {
  heading?: string;
  benefits: BenefitItem[];
}) {
  return (
    <section className="bg-white px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {heading && (
          <h2 className="mx-auto mb-10 max-w-2xl text-center text-2xl font-medium tracking-[-0.02em] text-slate-950 sm:mb-14 sm:text-4xl">
            {heading}
          </h2>
        )}

        <Stagger className="grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
          {benefits.map((benefit) => (
            <StaggerItem key={benefit.title}>
              <Card className="h-full rounded-[1.75rem] border-0 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-white">
                  <benefit.icon className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <h3 className="mt-5 text-base font-bold tracking-[-0.02em] text-slate-950">
                  {benefit.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{benefit.desc}</p>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
