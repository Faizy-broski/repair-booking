import React from "react";
import Link from "next/link";
import { Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";
import { FadeIn } from "@/components/landing/motion";

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-6 pb-4 sm:pt-10 sm:pb-6 lg:pt-14">
      <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
        <FadeIn className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm sm:mb-6 sm:text-xs">
          <Sparkles className="h-4 w-4 text-brand-teal" />
          New · Multi-branch reporting 2.0
        </FadeIn>

        <FadeIn delay={0.05}>
          <h1 className="mx-auto max-w-6xl text-[clamp(1.9rem,6.5vw,4rem)] font-medium leading-[1.02] tracking-[-0.03em] text-slate-950 sm:leading-[0.98] sm:tracking-[-0.04em]">
            The All-In-One{" "}
            <span className="font-segoe-script font-normal italic text-brand-teal">
              Operating
            </span>
            <br />
            <span className="font-segoe-script font-normal italic text-brand-teal">
              System
            </span>{" "}
            For Modern Repair Shops
          </h1>
        </FadeIn>

        <FadeIn delay={0.1}>
          <p className="mx-auto mt-4 max-w-4xl text-base font-medium leading-relaxed text-slate-600 sm:mt-6 sm:text-xl">
            Manage repairs, inventory, POS, staff, customer communication and
            multi- branch operations from one beautifully connected platform.
          </p>
        </FadeIn>

        <FadeIn
          delay={0.15}
          className="mt-6 flex flex-col items-center justify-center gap-3 sm:mt-8 sm:flex-row sm:gap-4"
        >
          <Link
            href="/register"
            className="group inline-flex w-full items-center justify-center gap-3 rounded-full bg-[linear-gradient(90deg,_#008080_0%,_#008080_37%,_#18E3CD_100%)] px-6 py-3.5 text-base font-bold text-white shadow-sm transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_14px_36px_rgba(0,128,128,0.35)] sm:w-auto"
          >
            Start Free Trial
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>


        </FadeIn>

        <FadeIn
          delay={0.2}
          className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs font-medium text-slate-700 sm:mt-6 sm:gap-x-12 sm:gap-y-4 sm:text-sm"
        >
          {[
            "No credit card required",
            "30-day free trial",
            "Trusted by repair shops",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-brand-teal" />
              <span>{item}</span>
            </div>
          ))}
        </FadeIn>
      </div>
    </section>
  );
}
