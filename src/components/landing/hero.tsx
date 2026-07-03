import React from "react";
import Link from "next/link";
import { Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";
import { FadeIn } from "@/components/landing/motion";

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-10 pb-8 sm:pt-16 sm:pb-10 lg:pt-20">
      <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
        <FadeIn className="mb-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[11px] font-extrabold text-slate-900 shadow-sm sm:mb-9 sm:text-xs">
          <Sparkles className="h-4 w-4 text-brand-teal" />
          New · Multi-branch reporting 2.0
        </FadeIn>

        <FadeIn delay={0.05}>
          <h1 className="mx-auto max-w-5xl text-[clamp(2.2rem,8vw,5.5rem)] font-medium leading-[1.02] tracking-[-0.03em] text-slate-950 sm:leading-[0.98] sm:tracking-[-0.04em]">
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
          <p className="mx-auto mt-6 max-w-4xl text-base font-medium leading-relaxed text-slate-600 sm:mt-8 sm:text-xl">
            Manage repairs, inventory, POS, staff, customer communication and
            multi- branch operations from one beautifully connected platform.
          </p>
        </FadeIn>

        <FadeIn
          delay={0.15}
          className="mt-8 flex flex-col items-center justify-center gap-3 sm:mt-10 sm:flex-row sm:gap-4"
        >
          <Link
            href="/register"
            className="inline-flex w-full items-center justify-center gap-3 rounded-full bg-[linear-gradient(90deg,_#008080_0%,_#008080_37%,_#18E3CD_100%)] px-8 py-4 text-base font-bold text-white shadow-sm transition-transform hover:scale-[1.02] sm:w-auto"
          >
            Start Free Trial
            <ArrowRight className="h-4 w-4" />
          </Link>

          <Link
            href="#demo"
            className="inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white px-9 py-4 text-base font-bold text-slate-950 shadow-sm transition-colors hover:bg-slate-50 sm:w-auto"
          >
            Book a Demo
          </Link>
        </FadeIn>

        <FadeIn
          delay={0.2}
          className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs font-medium text-slate-700 sm:mt-14 sm:gap-x-12 sm:gap-y-4 sm:text-sm"
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
