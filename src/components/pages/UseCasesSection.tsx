import { Check } from "lucide-react";
import { FadeIn, Stagger, StaggerItem } from "@/components/landing/motion";

export default function UseCasesSection({
  heading = "Common use cases",
  items,
}: {
  heading?: string;
  items: { title: string; desc: string }[];
}) {
  return (
    <section className="bg-slate-50/60 px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <FadeIn className="mb-10 sm:mb-14">
          <h2 className="max-w-2xl text-2xl font-medium tracking-[-0.02em] text-slate-950 sm:text-4xl">
            {heading}
          </h2>
        </FadeIn>

        <Stagger className="grid gap-5 sm:grid-cols-2 sm:gap-6">
          {items.map((item) => (
            <StaggerItem key={item.title}>
              <div className="flex gap-4 rounded-[1.5rem] bg-white p-6 shadow-[0_10px_35px_rgba(15,23,42,0.05)]">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-teal-light text-brand-teal">
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-950">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">{item.desc}</p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
