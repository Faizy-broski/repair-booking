"use client";

import { Minus, Plus, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

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
}: {
  label: string;
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-1.5">
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-white/90">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-teal/20 text-brand-teal shadow-[0_0_10px_rgba(0,128,128,0.2)]">
          <Check className="h-2.5 w-2.5" />
        </span>
        <span className="leading-tight">{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
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
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70 transition-all hover:bg-brand-teal hover:text-white hover:shadow-[0_0_10px_rgba(0,128,128,0.4)]"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="min-w-[32px] text-center text-xs font-semibold text-white">{value}</span>
            <button
              type="button"
              onClick={onIncrement}
              aria-label={`Increase ${label}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70 transition-all hover:bg-brand-teal hover:text-white hover:shadow-[0_0_10px_rgba(0,128,128,0.4)]"
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
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="ml-8 mt-2 flex cursor-pointer items-center gap-2 text-xs font-medium text-white/60 transition-colors hover:text-white/80">
      <div className={cn(
        "flex h-4 w-4 items-center justify-center rounded transition-colors",
        checked ? "bg-brand-teal text-white" : "border border-white/30 bg-transparent"
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
}: {
  state: CustomPlanState;
  onChange: (next: CustomPlanState) => void;
  baseline: CustomPlanBaseline;
  ctaLabel: string;
  ctaHref?: string;
  onCtaClick?: () => void;
  highlight?: boolean;
  disabled?: boolean;
}) {
  const price = computeCustomPlanPrice(state, baseline);

  const CtaTag = ctaHref ? "a" : "button";

  return (
    <div
      className={cn(
        "relative flex min-h-[405px] flex-col rounded-[24px] border p-7 shadow-2xl backdrop-blur-xl transition-all",
        highlight
          ? "min-h-[445px] border-brand-teal/70 bg-[#04152b]/95 shadow-[0_0_70px_rgba(0,128,128,0.35)] lg:-mt-8"
          : "border-white/10 bg-white/15 hover:bg-white/[0.18]"
      )}
    >
      <h3 className="text-2xl font-light text-white">Custom Plan</h3>

      <div className="mt-7 flex items-end gap-2">
        <span className="text-5xl font-light tracking-tight text-white">
          £{price}
        </span>
        <span className="mb-2 text-sm text-white/50">/ month</span>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-white/55">
        Build your own plan scale branches, staff, and limits exactly to
        your needs.
      </p>

      <div className="mt-8 flex-1 space-y-3">
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06]">
          <Stepper
            label="Branches"
            value={String(state.branches)}
            onDecrement={() =>
              onChange({ ...state, branches: Math.max(baseline.baseBranches, state.branches - 1) })
            }
            onIncrement={() => onChange({ ...state, branches: state.branches + 1 })}
          />
        </div>
        
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06]">
          <Stepper
            label="Staff"
            value={String(state.staff)}
            onDecrement={() =>
              onChange({ ...state, staff: Math.max(baseline.baseStaff, state.staff - 5) })
            }
            onIncrement={() => onChange({ ...state, staff: state.staff + 5 })}
          />
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06]">
          <Stepper
            label="Inventory management"
            value={state.inventoryUnlimited ? "Unlimited" : String(state.inventoryLimit)}
            disabled={state.inventoryUnlimited}
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
          />
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06]">
          <Stepper
            label="Repair ticketing"
            value={state.repairUnlimited ? "Unlimited" : String(state.repairLimit)}
            disabled={state.repairUnlimited}
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
          />
        </div>
      </div>

      <CtaTag
        {...(ctaHref ? { href: ctaHref } : { type: "button" as const, onClick: onCtaClick, disabled })}
        className={cn(
          "mt-8 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors",
          highlight
            ? "bg-white text-slate-950 hover:bg-white/90"
            : "border border-white/15 bg-transparent text-white hover:bg-white/10",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        {ctaLabel}
        <ChevronRight className="h-4 w-4" />
      </CtaTag>
    </div>
  );
}
