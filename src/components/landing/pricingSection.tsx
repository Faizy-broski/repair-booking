"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FadeIn, Stagger, StaggerItem } from "@/components/landing/motion";
import {
  CustomPlanCard,
  deriveCustomPlanBaseline,
  makeDefaultCustomPlanState,
  type CustomPlanState,
} from "@/components/landing/custom-plan-card";
import { ANNUAL_DISCOUNT } from "@/lib/pricing";

interface PricingPlan {
  id: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  max_branches: number;
  max_users: number;
  features: string[];
  limits: Record<string, number | boolean | null>;
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

// Maps a module key to the plans.limits key that caps it, so the pricing
// card can show e.g. "Inventory management — up to 500" inline.
const MODULE_LIMIT_KEY: Record<string, string> = {
  inventory: "max_products",
  repairs: "max_services",
  customers: "max_customers",
  employees: "max_employees",
  appointments: "max_appointments_per_month",
  custom_fields: "max_custom_fields",
};
function limitSuffix(
  moduleKey: string,
  limits: PricingPlan["limits"],
): string | null {
  const limitKey = MODULE_LIMIT_KEY[moduleKey];
  if (!limitKey || !(limitKey in limits)) return null;
  const v = limits[limitKey];
  if (v === null) return "unlimited";
  if (typeof v === "number") return `up to ${v.toLocaleString()}`;
  return null;
}

function planDesc(p: PricingPlan) {
  if (p.plan_type === "enterprise")
    return "For chains and franchises that need full control and SLA guarantees.";
  const branches =
    p.max_branches >= 50
      ? "unlimited branches"
      : `${p.max_branches} branch${p.max_branches > 1 ? "es" : ""}`;
  const users =
    p.max_users >= 999 ? "unlimited staff" : `up to ${p.max_users} staff`;
  return (
    <>
      For businesses needing{" "}
      <strong className="font-semibold text-brand-teal">{branches}</strong>{" "}
      and{" "}
      <strong className="font-semibold text-brand-teal">{users}</strong>.
    </>
  );
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [customPlan, setCustomPlan] = useState<CustomPlanState | null>(null);
  const customPlanBaseline = useMemo(() => deriveCustomPlanBaseline(plans), [plans]);
  const effectiveCustomPlan = customPlan ?? makeDefaultCustomPlanState(customPlanBaseline);

  function handleCustomPlanCta() {
    sessionStorage.setItem("pendingCustomPlan", JSON.stringify(effectiveCustomPlan));
    window.location.href = "/register";
  }
  const SHOWN_FEATURES = 6;
  function toggleExpanded(planId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(planId) ? next.delete(planId) : next.add(planId);
      return next;
    });
  }
  useEffect(() => {
    fetch("/api/plans")
      .then((r) => r.json())
      .then((j) => setPlans(j.data ?? []))
      .catch(() => {})
      .finally(() => setPlansLoading(false));
  }, []);

  // Every plan (including Custom) gets the same flat annual discount — see
  // src/lib/pricing.ts. Annual total is always monthly * 12 * (1 - ANNUAL_DISCOUNT),
  // never each plan's separately admin-set price_yearly.
  const annualDiscountPct = Math.round(ANNUAL_DISCOUNT * 100);

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
                -{annualDiscountPct}%
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
              plans.length + 1 === 2
                ? "mx-auto max-w-3xl grid-cols-1 sm:grid-cols-2"
                : plans.length + 1 === 3
                  ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
            }`}
          >
            {plans.map((plan, idx) => {
              const highlight = isHighlighted(plans, idx);
              const isTrulyFree = plan.price_monthly === 0;
              const isEnterprise = plan.plan_type === "enterprise";
              const isYearly =
                billing === "yearly" && !isTrulyFree && !isEnterprise;
              const yearlyTotal = Math.round(plan.price_monthly * 12 * (1 - ANNUAL_DISCOUNT));
              const yearlySavings = plan.price_monthly * 12 - yearlyTotal;
              const yearlyPct = annualDiscountPct;
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

                  {isYearly && yearlySavings > 0 && (
                    <p className="mt-1 text-xs font-semibold text-brand-teal">
                      {yearlyPct}% off — saves £{yearlySavings}/yr vs monthly
                    </p>
                  )}

                  <p className="mt-4 text-sm leading-relaxed text-white/55">
                    {planDesc(plan)}
                  </p>

                  {(() => {
                    const allFeatures = Array.isArray(plan.features)
                      ? plan.features
                      : [];
                    const isOpen = expanded.has(plan.id);
                    const visible = isOpen
                      ? allFeatures
                      : allFeatures.slice(0, SHOWN_FEATURES);
                    const remaining = allFeatures.length - SHOWN_FEATURES;
                    return (
                      <>
                        <ul className="mt-8 flex-1 space-y-4">
                          {visible.map((f) => {
                            const suffix = limitSuffix(f, plan.limits ?? {});
                            return (
                              <li
                                key={f}
                                className="flex items-center justify-between gap-3 text-sm text-white/70"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-brand-teal text-brand-teal">
                                    <Check className="h-2.5 w-2.5" />
                                  </span>
                                  <span>{fmtFeature(f)}</span>
                                </div>
                                {suffix && (
                                  <span
                                    className={cn(
                                      "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset",
                                      suffix === "unlimited"
                                        ? "bg-brand-teal/10 text-brand-teal ring-brand-teal/20"
                                        : "bg-white/5 text-white/60 ring-white/10"
                                    )}
                                  >
                                    {suffix}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                        {remaining > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(plan.id)}
                            className="mt-3 text-left text-sm font-medium text-brand-teal hover:underline"
                          >
                            {isOpen ? "Show less" : `See more (+${remaining})`}
                          </button>
                        )}
                      </>
                    );
                  })()}

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
            <StaggerItem>
              <CustomPlanCard
                state={effectiveCustomPlan}
                onChange={setCustomPlan}
                baseline={customPlanBaseline}
                billingCycle={billing}
                ctaLabel="Start 30 Days free trial"
                onCtaClick={handleCustomPlanCta}
              />
            </StaggerItem>
          </Stagger>
        )}
      </div>
    </section>
  );
}
