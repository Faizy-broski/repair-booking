"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FadeIn, Stagger, StaggerItem } from "@/components/landing/motion";

interface PricingPlan {
  id: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  max_branches: number;
  max_users: number;
  features: string[];
  plan_type: "free" | "paid" | "enterprise";
  stripe_price_id_monthly: string | null;
}

const FEATURE_LABELS: Record<string, string> = {
  pos: "Point of Sale",
  inventory: "Inventory management",
  repairs: "Repair ticketing",
  reports: "Reports & analytics",
  messaging: "Customer messaging",
  appointments: "Appointment booking",
  expenses: "Expense tracking",
  employees: "Employee management",
  gift_cards: "Gift cards",
  google_reviews: "Google review requests",
  phone: "VoIP phone",
  custom_fields: "Custom fields",
};
function fmtFeature(k: string) {
  return (
    FEATURE_LABELS[k] ??
    k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function planDesc(p: PricingPlan): string {
  if (p.plan_type === "enterprise")
    return "For chains and franchises that need full control and SLA guarantees.";
  const branches =
    p.max_branches >= 50
      ? "unlimited branches"
      : `${p.max_branches} branch${p.max_branches > 1 ? "es" : ""}`;
  const users =
    p.max_users >= 999 ? "unlimited staff" : `up to ${p.max_users} staff`;
  return `For businesses needing ${branches} and ${users}.`;
}
function planCta(p: PricingPlan): string {
  if (p.plan_type === "enterprise") return "Contact sales";
  if (p.plan_type === "free") return "Start 30 Days free trial";
  return "Start 30 Days free trial";
}
function planCtaHref(p: PricingPlan): string {
  return p.plan_type === "enterprise"
    ? "mailto:connect@repairbooking.co.uk"
    : "/register";
}
function isHighlighted(plans: PricingPlan[], idx: number): boolean {
  return plans.length >= 2 && idx === Math.floor(plans.length / 2);
}

export default function PricingSection() {
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  useEffect(() => {
    fetch("/api/plans")
      .then((r) => r.json())
      .then((j) => setPlans(j.data ?? []))
      .catch(() => {})
      .finally(() => setPlansLoading(false));
  }, []);

  return (
    <section
      id="pricing"
      className="relative overflow-hidden bg-[url('/images/pricingHero.svg')] bg-no-repeat bg-center bg-cover py-14 text-white sm:py-20 lg:py-24"
    >
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <FadeIn className="mx-auto max-w-2xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/80 sm:mb-7">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            Pricing
          </div>

          <h2 className="text-3xl font-light tracking-tight sm:text-5xl lg:text-6xl">
            Built like an instrument.
            <br />
            Priced like a <em className="font-light italic">tool.</em>
          </h2>

          <p className="mx-auto mt-6 max-w-xl text-sm leading-7 text-white/60 sm:mt-8 sm:text-base">
            One price, every module, no per-seat surprises. Cancel anytime —
            keep your data.
          </p>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 p-1.5 backdrop-blur sm:mt-8">
            <button
              onClick={() => setBilling("monthly")}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                billing === "monthly"
                  ? "bg-white text-slate-950"
                  : "text-white/55 hover:text-white"
              }`}
            >
              Monthly
            </button>

            <button
              onClick={() => setBilling("yearly")}
              className={`relative rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                billing === "yearly"
                  ? "bg-white text-slate-950"
                  : "text-white/55 hover:text-white"
              }`}
            >
              Annual
              <span className="absolute -right-3 -top-3 rounded-full bg-brand-yellow px-1.5 py-0.5 text-[10px] font-black text-slate-950">
                -20%
              </span>
            </button>
          </div>
        </FadeIn>

        {plansLoading ? (
          <div className="mt-12 grid grid-cols-1 gap-6 sm:mt-20 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="min-h-[405px] animate-pulse rounded-[24px] border border-white/10 bg-white/10 p-7 backdrop-blur-xl"
              >
                <div className="h-5 w-24 rounded bg-white/10" />
                <div className="mt-7 h-12 w-32 rounded bg-white/10" />
                <div className="mt-4 h-3 w-44 rounded bg-white/10" />
                <div className="mt-8 space-y-4">
                  {[1, 2, 3, 4, 5].map((j) => (
                    <div key={j} className="h-3 w-full rounded bg-white/10" />
                  ))}
                </div>
                <div className="mt-8 h-11 w-full rounded-full bg-white/10" />
              </div>
            ))}
          </div>
        ) : (
          <Stagger
            className={`mt-12 grid items-center gap-6 sm:mt-20 ${
              plans.length === 1
                ? "mx-auto max-w-sm"
                : plans.length === 2
                  ? "mx-auto max-w-3xl grid-cols-1 sm:grid-cols-2"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            }`}
          >
            {plans.map((plan, idx) => {
              const highlight = isHighlighted(plans, idx);
              const isTrulyFree = plan.price_monthly === 0;
              const isEnterprise = plan.plan_type === "enterprise";
              const isYearly =
                billing === "yearly" && !isTrulyFree && !isEnterprise;
              const yearlyTotal =
                plan.price_yearly > 0
                  ? plan.price_yearly
                  : Math.round(plan.price_monthly * 12 * 0.8);
              const fmtPrice = (n: number) =>
                n % 1 === 0 ? String(Math.round(n)) : n.toFixed(2);

              return (
                <StaggerItem
                  key={plan.id}
                  className={`relative flex min-h-[405px] flex-col rounded-[24px] border p-7 shadow-2xl backdrop-blur-xl transition-all ${
                    highlight
                      ? "min-h-[445px] border-brand-teal/70 bg-[#04152b]/95 shadow-[0_0_70px_rgba(0,128,128,0.35)] lg:-mt-8"
                      : "border-white/10 bg-white/15 hover:bg-white/[0.18]"
                  }`}
                >
                  {highlight && (
                    <div className="absolute -top-4 left-7 rounded-full bg-brand-teal px-4 py-2 text-xs font-bold text-white shadow-lg">
                      Most chosen
                    </div>
                  )}

                  <h3 className="text-2xl font-light text-white">
                    {plan.name}
                  </h3>

                  <div className="mt-7 flex items-end gap-2">
                    {isEnterprise ? (
                      <span className="text-5xl font-light tracking-tight text-white">
                        Custom
                      </span>
                    ) : isYearly ? (
                      <>
                        <span className="text-5xl font-light tracking-tight text-white">
                          £{yearlyTotal}
                        </span>
                        <span className="mb-2 text-sm text-white/50">
                          / year
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-5xl font-light tracking-tight text-white">
                          £{fmtPrice(plan.price_monthly)}
                        </span>
                        <span className="mb-2 text-sm text-white/50">
                          / month
                        </span>
                      </>
                    )}
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-white/55">
                    {planDesc(plan)}
                  </p>

                  <ul className="mt-8 flex-1 space-y-4">
                    {(Array.isArray(plan.features) ? plan.features : []).map(
                      (f) => (
                        <li
                          key={f}
                          className="flex items-center gap-3 text-sm text-white/70"
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-brand-teal text-brand-teal">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                          {fmtFeature(f)}
                        </li>
                      ),
                    )}
                  </ul>

                  <Link
                    href={planCtaHref(plan)}
                    className={`mt-8 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors ${
                      highlight
                        ? "bg-white text-slate-950 hover:bg-white/90"
                        : "border border-white/15 bg-transparent text-white hover:bg-white/10"
                    }`}
                  >
                    {planCta(plan)}
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </StaggerItem>
              );
            })}
          </Stagger>
        )}
      </div>
    </section>
  );
}
