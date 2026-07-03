import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { FadeIn } from "@/components/landing/motion";

export default function PageHero({
  icon: Icon,
  kicker,
  title,
  description,
  primaryCtaLabel = "Start Free Trial",
  primaryCtaHref = "/register",
  secondaryCtaLabel = "Book a Demo",
  secondaryCtaHref = "#demo",
}: {
  icon?: LucideIcon;
  kicker: string;
  title: string;
  description: string;
  primaryCtaLabel?: string;
  primaryCtaHref?: string;
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
}) {
  return (
    <section className="relative overflow-hidden pt-10 pb-12 sm:pt-16 sm:pb-16 lg:pt-20">
      <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
        <FadeIn className="mb-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[11px] font-extrabold text-slate-900 shadow-sm sm:mb-9 sm:text-xs">
          {Icon && <Icon className="h-4 w-4 text-brand-teal" />}
          {kicker}
        </FadeIn>

        <FadeIn delay={0.05}>
          <h1 className="mx-auto max-w-4xl text-[clamp(2rem,6vw,3.75rem)] font-medium leading-[1.05] tracking-[-0.03em] text-slate-950">
            {title}
          </h1>
        </FadeIn>

        <FadeIn delay={0.1}>
          <p className="mx-auto mt-6 max-w-2xl text-base font-medium leading-relaxed text-slate-600 sm:text-lg">
            {description}
          </p>
        </FadeIn>

        <FadeIn
          delay={0.15}
          className="mt-8 flex flex-col items-center justify-center gap-3 sm:mt-10 sm:flex-row sm:gap-4"
        >
          <Link
            href={primaryCtaHref}
            className="inline-flex w-full items-center justify-center gap-3 rounded-full bg-[linear-gradient(90deg,_#008080_0%,_#008080_37%,_#18E3CD_100%)] px-8 py-4 text-base font-bold text-white shadow-sm transition-transform hover:scale-[1.02] sm:w-auto"
          >
            {primaryCtaLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>

          <Link
            href={secondaryCtaHref}
            className="inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white px-9 py-4 text-base font-bold text-slate-950 shadow-sm transition-colors hover:bg-slate-50 sm:w-auto"
          >
            {secondaryCtaLabel}
          </Link>
        </FadeIn>
      </div>
    </section>
  );
}
