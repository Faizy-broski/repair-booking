"use client";

import { Minus, Plus, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ANNUAL_DISCOUNT } from "@/lib/pricing";

// Mirrors src/backend/services/custom-plan-pricing.ts's CustomPlanBaseline —
// the base price and floors always come from the current cheapest paid plan
// (fetched via /api/plans), never hardcoded, so editing that plan in
// superadmin is reflected here automatically.
export interface CustomPlanBaseline {
  basePricePence: number;
  baseBranches: number;
  baseStaff: number;
  baseInventory: number;
  baseRepair: number;
}

// Frontend-only state shape — keeps the last numeric value around while
// "Unlimited" is toggled on, so toggling back off restores it instead of
// resetting to the baseline. The wire payload sent to the server collapses
// this down to `{ branches, staff, inventoryLimit: number|null, repairLimit: number|null }`
// via toCustomPlanPayload(), matching the backend's customPlanDimensionsSchema.
export interface CustomPlanState {
  branches: number;
  staff: number;
  inventoryLimit: number;
  inventoryUnlimited: boolean;
  repairLimit: number;
  repairUnlimited: boolean;
}

// Emergency fallback only — used if no active paid plan can be found at all
// (shouldn't happen in practice). Real usage always derives the baseline from
// the live /api/plans data via this function.
const FALLBACK_BASELINE: CustomPlanBaseline = {
  basePricePence: 1900,
  baseBranches: 1,
  baseStaff: 5,
  baseInventory: 500,
  baseRepair: 100,
};


/** Derives the Custom Plan baseline from a fetched /api/plans list — the
 * cheapest active "paid" plan's own numbers, never hardcoded. Shared by
 * every page that renders <CustomPlanCard> so they all agree on the same
 * source of truth as the backend's getCustomPlanBaseline(). */
export function deriveCustomPlanBaseline(
  plans: Array<{
    price_monthly: number;
    max_branches: number | null;
    max_users: number | null;
    limits?: Record<string, number | boolean | null> | null;
    plan_type?: string;
  }>
): CustomPlanBaseline {
  const cheapest = plans
    .filter((p) => p.plan_type === "paid")
    .sort((a, b) => a.price_monthly - b.price_monthly)[0];

  if (!cheapest) return FALLBACK_BASELINE;

  const limits = cheapest.limits ?? {};
  const maxProducts = limits.max_products;
  const maxServices = limits.max_services;

  return {
    basePricePence: Math.round(cheapest.price_monthly * 100),
    baseBranches: cheapest.max_branches ?? FALLBACK_BASELINE.baseBranches,
    baseStaff: cheapest.max_users ?? FALLBACK_BASELINE.baseStaff,
    baseInventory: typeof maxProducts === "number" ? maxProducts : FALLBACK_BASELINE.baseInventory,
    baseRepair: typeof maxServices === "number" ? maxServices : FALLBACK_BASELINE.baseRepair,
  };
}

export function makeDefaultCustomPlanState(baseline: CustomPlanBaseline): CustomPlanState {
  return {
    branches: baseline.baseBranches,
    staff: baseline.baseStaff,
    inventoryLimit: baseline.baseInventory,
    inventoryUnlimited: false,
    repairLimit: baseline.baseRepair,
    repairUnlimited: false,
  };
}

/** Display-only — the server always independently recomputes this in pence. */
export function computeCustomPlanPrice(state: CustomPlanState, baseline: CustomPlanBaseline): number {
  let total = baseline.basePricePence / 100;
  total += (state.branches - baseline.baseBranches) * 15;
  total += ((state.staff - baseline.baseStaff) / 5) * 5;
  total += state.inventoryUnlimited
    ? 10
    : ((state.inventoryLimit - baseline.baseInventory) / 1000) * 5;
  total += state.repairUnlimited
    ? 10
    : ((state.repairLimit - baseline.baseRepair) / 1000) * 5;
  return total;
}

/**
 * Display-only annual total (full year, 10% off) — mirrors
 * computeCustomPlanTotalPence(..., 'yearly') on the backend. Not a
 * monthly-equivalent: this is the single amount Stripe will charge once a
 * year, same convention as the sibling plans' price_yearly display.
 */
export function computeCustomPlanAnnualPrice(state: CustomPlanState, baseline: CustomPlanBaseline): number {
  const monthly = computeCustomPlanPrice(state, baseline);
  return Math.round(monthly * 12 * (1 - ANNUAL_DISCOUNT));
}

export function toCustomPlanPayload(state: CustomPlanState) {
  return {
    branches: state.branches,
    staff: state.staff,
    inventoryLimit: state.inventoryUnlimited ? null : state.inventoryLimit,
    repairLimit: state.repairUnlimited ? null : state.repairLimit,
  };
}

function Stepper({
  label,
  value,
  onDecrement,
  onIncrement,
  disabled,
  light,
}: {
  label: string;
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
  disabled?: boolean;
  light?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-1.5 gap-y-1.5">
      <span className={cn("flex items-center gap-2 text-sm font-medium", light ? "text-gray-700" : "text-white/90")}>
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-teal/20 text-brand-teal shadow-[0_0_10px_rgba(0,128,128,0.2)]">
          <Check className="h-2.5 w-2.5" />
        </span>
        <span className="leading-tight">{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 ml-auto">
        {disabled ? (
          <span className="inline-flex items-center rounded-full bg-brand-teal/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-teal ring-1 ring-inset ring-brand-teal/20">
            {value}
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={onDecrement}
              aria-label={`Decrease ${label}`}
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all hover:bg-brand-teal hover:text-white hover:shadow-[0_0_10px_rgba(0,128,128,0.4)]",
                light ? "bg-gray-100 text-gray-500" : "bg-white/10 text-white/70"
              )}
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className={cn("min-w-[32px] text-center text-xs font-semibold", light ? "text-gray-900" : "text-white")}>{value}</span>
            <button
              type="button"
              onClick={onIncrement}
              aria-label={`Increase ${label}`}
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all hover:bg-brand-teal hover:text-white hover:shadow-[0_0_10px_rgba(0,128,128,0.4)]",
                light ? "bg-gray-100 text-gray-500" : "bg-white/10 text-white/70"
              )}
            >
              <Plus className="h-3 w-3" />
            </button>
          </>
        )}
      </span>
    </div>
  );
}

function UnlimitedToggle({
  checked,
  onChange,
  light,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  light?: boolean;
}) {
  return (
    <label className={cn(
      "ml-8 mt-2 flex cursor-pointer items-center gap-2 text-xs font-medium transition-colors",
      light ? "text-gray-500 hover:text-gray-700" : "text-white/60 hover:text-white/80"
    )}>
      <div className={cn(
        "flex h-4 w-4 items-center justify-center rounded transition-colors",
        checked ? "bg-brand-teal text-white" : light ? "border border-gray-300 bg-transparent" : "border border-white/30 bg-transparent"
      )}>
        {checked && <Check className="h-3 w-3" />}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="hidden"
      />
      Unlimited (+£10/mo)
    </label>
  );
}

export function CustomPlanCard({
  state,
  onChange,
  baseline,
  ctaLabel,
  ctaHref,
  onCtaClick,
  highlight,
  disabled,
  variant = "dark",
  billingCycle = "monthly",
}: {
  state: CustomPlanState;
  onChange: (next: CustomPlanState) => void;
  baseline: CustomPlanBaseline;
  ctaLabel: string;
  ctaHref?: string;
  onCtaClick?: () => void;
  highlight?: boolean;
  disabled?: boolean;
  /** 'light' renders on a white card for light-themed dashboard pages; 'dark' (default) is the glassmorphism look for the dark marketing hero. */
  variant?: "dark" | "light";
  billingCycle?: "monthly" | "yearly";
}) {
  const light = variant === "light";
  const monthlyPrice = computeCustomPlanPrice(state, baseline);
  const showYearly = billingCycle === "yearly";
  const annualPrice = computeCustomPlanAnnualPrice(state, baseline);
  const annualSavings = monthlyPrice * 12 - annualPrice;
  const displayPrice = showYearly ? annualPrice : monthlyPrice;

  const CtaTag = ctaHref ? "a" : "button";

  return (
    <div
      className={cn(
        "relative flex min-h-[405px] flex-col rounded-[24px] border p-7 transition-all",
        light
          ? highlight
            ? "min-h-[445px] border-brand-teal bg-brand-teal/5 shadow-lg lg:-mt-8"
            : "border-gray-200 bg-white shadow-sm hover:shadow-md"
          : cn(
              "shadow-2xl backdrop-blur-xl",
              highlight
                ? "min-h-[445px] border-brand-teal/70 bg-[#04152b]/95 shadow-[0_0_70px_rgba(0,128,128,0.35)] lg:-mt-8"
                : "border-white/10 bg-white/15 hover:bg-white/[0.18]"
            )
      )}
    >
      <h3 className={cn("text-2xl font-light", light ? "text-gray-900" : "text-white")}>Custom Plan</h3>

      <div className="mt-7 flex items-end gap-2">
        <span className={cn("text-5xl font-light tracking-tight", light ? "text-gray-900" : "text-white")}>
          £{displayPrice}
        </span>
        <span className={cn("mb-2 text-sm", light ? "text-gray-400" : "text-white/50")}>{showYearly ? "/ year" : "/ month"}</span>
      </div>

      {showYearly ? (
        <p className={cn("mt-1 text-xs font-semibold", light ? "text-green-600" : "text-brand-teal")}>
          {Math.round(ANNUAL_DISCOUNT * 100)}% off — saves £{annualSavings}/yr vs monthly
        </p>
      ) : null}

      <p className={cn("mt-4 text-sm leading-relaxed", light ? "text-gray-500" : "text-white/55")}>
        Build your own plan scale branches, staff, and limits exactly to
        your needs.
      </p>

      <div className="mt-8 flex-1 space-y-3">
        <div className={cn("rounded-xl border p-3 transition-colors", light ? "border-gray-100 bg-gray-50 hover:bg-gray-100" : "border-white/5 bg-white/[0.03] hover:bg-white/[0.06]")}>
          <Stepper
            label="Branches"
            value={String(state.branches)}
            light={light}
            onDecrement={() =>
              onChange({ ...state, branches: Math.max(baseline.baseBranches, state.branches - 1) })
            }
            onIncrement={() => onChange({ ...state, branches: state.branches + 1 })}
          />
        </div>

        <div className={cn("rounded-xl border p-3 transition-colors", light ? "border-gray-100 bg-gray-50 hover:bg-gray-100" : "border-white/5 bg-white/[0.03] hover:bg-white/[0.06]")}>
          <Stepper
            label="Staff"
            value={String(state.staff)}
            light={light}
            onDecrement={() =>
              onChange({ ...state, staff: Math.max(baseline.baseStaff, state.staff - 5) })
            }
            onIncrement={() => onChange({ ...state, staff: state.staff + 5 })}
          />
        </div>

        <div className={cn("rounded-xl border p-3 transition-colors", light ? "border-gray-100 bg-gray-50 hover:bg-gray-100" : "border-white/5 bg-white/[0.03] hover:bg-white/[0.06]")}>
          <Stepper
            label="Inventory"
            value={state.inventoryUnlimited ? "Unlimited" : String(state.inventoryLimit)}
            disabled={state.inventoryUnlimited}
            light={light}
            onDecrement={() =>
              onChange({
                ...state,
                inventoryLimit: Math.max(baseline.baseInventory, state.inventoryLimit - 1000),
              })
            }
            onIncrement={() =>
              onChange({ ...state, inventoryLimit: state.inventoryLimit + 1000 })
            }
          />
          <UnlimitedToggle
            checked={state.inventoryUnlimited}
            onChange={(v) => onChange({ ...state, inventoryUnlimited: v })}
            light={light}
          />
        </div>

        <div className={cn("rounded-xl border p-3 transition-colors", light ? "border-gray-100 bg-gray-50 hover:bg-gray-100" : "border-white/5 bg-white/[0.03] hover:bg-white/[0.06]")}>
          <Stepper
            label="Repairs"
            value={state.repairUnlimited ? "Unlimited" : String(state.repairLimit)}
            disabled={state.repairUnlimited}
            light={light}
            onDecrement={() =>
              onChange({
                ...state,
                repairLimit: Math.max(baseline.baseRepair, state.repairLimit - 1000),
              })
            }
            onIncrement={() =>
              onChange({ ...state, repairLimit: state.repairLimit + 1000 })
            }
          />
          <UnlimitedToggle
            checked={state.repairUnlimited}
            onChange={(v) => onChange({ ...state, repairUnlimited: v })}
            light={light}
          />
        </div>
      </div>

      <CtaTag
        {...(ctaHref ? { href: ctaHref } : { type: "button" as const, onClick: onCtaClick, disabled })}
        className={cn(
          "group mt-8 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-medium transition-all duration-300",
          !disabled && "hover:scale-[1.02]",
          light
            ? highlight
              ? "bg-brand-teal text-white hover:bg-brand-teal/90 hover:shadow-[0_10px_28px_rgba(0,128,128,0.3)]"
              : "border border-gray-300 text-gray-700 hover:bg-gray-50"
            : highlight
              ? "bg-white text-slate-950 hover:bg-white/90 hover:shadow-[0_10px_28px_rgba(255,255,255,0.25)]"
              : "border border-white/15 bg-transparent text-white hover:bg-white/10",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        {ctaLabel}
        <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
      </CtaTag>
    </div>
  );
}
