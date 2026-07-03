import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/landing/motion";

export default function CtaSection({
  heading = "Run your shop like a studio.",
  scriptWord = "studio.",
  description = "Fourteen days. Every module. No card. We'll port your data in, and you can keep it whether you stay or not.",
}: {
  heading?: string;
  scriptWord?: string;
  description?: string;
}) {
  const lead = heading.slice(0, heading.length - scriptWord.length).trim();

  return (
    <section className="bg-white py-14 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8">
        <FadeIn className="relative overflow-hidden rounded-[28px] bg-[url('/images/ctaBg.svg')] bg-cover bg-no-repeat px-6 py-12 text-white sm:rounded-[48px] sm:px-10 sm:py-20 md:px-20 lg:px-24">
          <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-12">
            <div>
              <Badge className="mb-5 rounded-full border-0 bg-white/20 px-5 py-2 text-xs font-medium uppercase tracking-[0.28em] text-white hover:bg-white/20 sm:mb-8">
                <span className="mr-2 h-2 w-2 rounded-full bg-white" />
                Begin
              </Badge>

              <h2 className="max-w-3xl text-4xl font-light leading-[0.95] tracking-[-0.03em] sm:text-6xl sm:leading-[0.92] sm:tracking-[-0.06em] md:text-7xl">
                {lead}
                <br />
                <span className="font-segoe-script text-4xl italic text-teal-500 sm:text-7xl md:text-7xl">
                  {scriptWord}
                </span>
              </h2>

              <p className="mt-6 max-w-md text-sm leading-6 text-white/65 sm:mt-10 sm:text-md">
                {description}
              </p>
            </div>

            <div className="flex flex-col items-stretch gap-4 sm:items-start sm:gap-7 lg:items-end lg:justify-end">
              <Link
                href="/register"
                className="inline-flex w-full items-center justify-center rounded-full bg-white px-7 py-4 text-sm font-medium text-slate-950 shadow-none transition-colors hover:bg-white/90 sm:w-auto sm:py-5 sm:text-md"
              >
                Start free trial
                <ArrowRight className="ml-4 h-5 w-5 sm:h-7 sm:w-7" />
              </Link>

              <Link
                href="#demo"
                className="inline-flex w-full items-center justify-center rounded-full border border-white/25 bg-white/5 px-7 py-4 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/10 sm:w-auto sm:py-5 sm:text-md"
              >
                Book a 20-min demo
                <ArrowRight className="ml-4 h-5 w-5 sm:h-6 sm:w-6" />
              </Link>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-white/55 sm:mt-6 sm:gap-4">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-3 w-3 text-white" />
                  SOC 2 Type II
                </span>
                <span className="flex items-center gap-2">
                  <Check className="h-3 w-3 text-white" />
                  Cancel any time
                </span>
                <span className="flex items-center gap-2">
                  <Check className="h-3 w-3 text-white" />
                  Free migration
                </span>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
