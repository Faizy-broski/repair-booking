import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/landing/motion";

export default function StartTrialSection() {
  return (
    <section className="bg-white py-10 sm:py-14 lg:py-20">
      <div className="mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8">
        <FadeIn className="relative overflow-hidden rounded-[28px] bg-[url('/images/ctaBg.svg')] px-6 py-10 text-white bg-no-repeat bg-cover sm:rounded-[40px] sm:px-8 sm:py-14 md:px-14 lg:px-16">

          <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-12">
            {/* Left */}
            <div>
              <Badge className="mb-4 rounded-full border-0 bg-white/20 px-5 py-2 text-xs font-medium uppercase tracking-[0.28em] text-white hover:bg-white/20 sm:mb-6">
                <span className="mr-2 h-2 w-2 rounded-full bg-white" />
                Begin
              </Badge>

              <h2 className="max-w-3xl text-3xl font-light leading-[0.95] tracking-[-0.03em] sm:text-5xl sm:leading-[0.92] sm:tracking-[-0.06em] md:text-6xl">
                Run your shop
                <br />
                <span className="font-segoe-script text-3xl italic text-teal-500 sm:text-6xl md:text-6xl">
                  like a studio.
                </span>
              </h2>

              <p className="mt-4 max-w-md text-sm leading-6 text-white/65 sm:mt-6 sm:text-md">
                Fourteen days. Every module. No card. We&apos;ll port your data
                in, and you can keep it whether you stay or not.
              </p>
            </div>

            {/* Right */}
            <div className="flex flex-col items-stretch gap-4 sm:items-start sm:gap-5 lg:items-end lg:justify-end">
              <Button className="group w-full rounded-full bg-white px-6 py-5 text-sm font-medium text-slate-950 shadow-none transition-all duration-300 hover:scale-[1.03] hover:bg-white/90 hover:shadow-[0_14px_36px_rgba(255,255,255,0.25)] sm:w-auto sm:py-6 sm:text-md">
                Start free trial
                <ArrowRight className="ml-4 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1 sm:h-6 sm:w-6" />
              </Button>

              <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-white/55 sm:mt-3 sm:gap-4">
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
