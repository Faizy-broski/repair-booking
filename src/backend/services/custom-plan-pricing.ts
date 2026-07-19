/**
 * Custom Plan pricing formula — single source of truth, used by every
 * entry point that can create/edit a custom plan (register, upgrade,
 * trial-time edit). Never trust a client-sent total; always recompute
 * here from the raw dimension values.
 *
 * All arithmetic is in pence (integers) to avoid IEEE-754 float drift —
 * Stripe's unit_amount must be a whole number.
 *
 * The base price and floors (branches/staff/inventory/repair) always
 * mirror the current cheapest paid plan ("Starter" today, identified by
 * lowest price_monthly rather than by name — robust to renaming) — never
 * hardcoded, so a superadmin edit to that plan's numbers is picked up
 * automatically everywhere a Custom Plan is built or priced. Only the
 * *increment costs* (+£15/branch, +£5 per 5 staff, +£5 per 1000 units,
 * +£10 flat for "Unlimited") are fixed business rules, independent of
 * any plan row. Must be kept in sync with the client-side mirror in
 * src/components/landing/custom-plan-card.tsx.
 */
import { z } from 'zod'

export interface CustomPlanBaseline {
  basePricePence: number
  baseBranches: number
  baseStaff: number
  baseInventory: number
  baseRepair: number
}

/**
 * Looks up the cheapest active paid plan and derives the Custom Plan's
 * base price/floors from it. Call this in every route that validates or
 * prices a custom plan — never hardcode these numbers.
 */
export async function getCustomPlanBaseline(supabase: any): Promise<CustomPlanBaseline> {
  const { data: cheapestPaidPlan, error } = await supabase
    .from('plans')
    .select('price_monthly, max_branches, max_users, limits')
    .eq('plan_type', 'paid')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true })
    .limit(1)
    .single()

  if (error || !cheapestPaidPlan) {
    throw new Error('No active paid plan found to derive Custom Plan baseline from')
  }

  const limits = (cheapestPaidPlan.limits ?? {}) as Record<string, number | null>

  return {
    basePricePence: Math.round(cheapestPaidPlan.price_monthly * 100),
    baseBranches:   cheapestPaidPlan.max_branches,
    baseStaff:      cheapestPaidPlan.max_users,
    baseInventory:  limits.max_products ?? 500,
    baseRepair:     limits.max_services ?? 100,
  }
}

/** Builds the zod validation schema for a given baseline's floors/steps. */
export function customPlanDimensionsSchema(baseline: CustomPlanBaseline) {
  return z.object({
    branches: z.number().int().min(baseline.baseBranches, `branches must be at least ${baseline.baseBranches}`),
    staff: z
      .number()
      .int()
      .min(baseline.baseStaff, `staff must be at least ${baseline.baseStaff}`)
      .refine((v) => (v - baseline.baseStaff) % 5 === 0, `staff must increase in steps of 5 from a base of ${baseline.baseStaff}`),
    inventoryLimit: z
      .number()
      .int()
      .min(baseline.baseInventory, `inventoryLimit must be at least ${baseline.baseInventory}`)
      .refine((v) => (v - baseline.baseInventory) % 1000 === 0, `inventoryLimit must increase in steps of 1000 from a base of ${baseline.baseInventory}`)
      .nullable(),
    repairLimit: z
      .number()
      .int()
      .min(baseline.baseRepair, `repairLimit must be at least ${baseline.baseRepair}`)
      .refine((v) => (v - baseline.baseRepair) % 1000 === 0, `repairLimit must increase in steps of 1000 from a base of ${baseline.baseRepair}`)
      .nullable(),
  })
}

export type CustomPlanDimensions = {
  branches: number
  staff: number
  inventoryLimit: number | null
  repairLimit: number | null
}

export type CustomPlanBillingCycle = 'monthly' | 'yearly'

// Custom Plan's own annual discount — intentionally separate from whatever
// discount an admin sets via a regular plan's price_yearly column, since the
// Custom Plan has no persisted Product/Price row to attach one to.
export const CUSTOM_PLAN_YEARLY_DISCOUNT = 0.10

/** Recomputes the monthly price in pence. Never trust a client-sent total — always call this. */
export function computeCustomPlanPricePence(dims: CustomPlanDimensions, baseline: CustomPlanBaseline): number {
  let total = baseline.basePricePence
  total += (dims.branches - baseline.baseBranches) * 1500
  total += ((dims.staff - baseline.baseStaff) / 5) * 500
  total += dims.inventoryLimit === null ? 1000 : ((dims.inventoryLimit - baseline.baseInventory) / 1000) * 500
  total += dims.repairLimit === null ? 1000 : ((dims.repairLimit - baseline.baseRepair) / 1000) * 500
  return Math.round(total)
}

/**
 * Recomputes the total charge in pence for the given billing cycle. For
 * 'yearly' this is the full annual charge (12 months at a 10% discount),
 * not a monthly-equivalent — matches how regular plans bill price_yearly
 * as a single annual amount via Stripe's `interval: 'year'`.
 */
export function computeCustomPlanTotalPence(
  dims: CustomPlanDimensions,
  baseline: CustomPlanBaseline,
  billingCycle: CustomPlanBillingCycle = 'monthly'
): number {
  const monthlyPence = computeCustomPlanPricePence(dims, baseline)
  if (billingCycle !== 'yearly') return monthlyPence
  return Math.round(monthlyPence * 12 * (1 - CUSTOM_PLAN_YEARLY_DISCOUNT))
}

/**
 * Resolves the real £/month a subscription is worth for revenue displays
 * (MRR, dashboard, analytics, subscriptions list). Every custom subscription's
 * plan_id points at the shared "Custom Plan" placeholder row (price_monthly
 * £19 today) purely for FK integrity — the actual negotiated price lives on
 * the subscription row itself in custom_price_monthly. Reading plan.price_monthly
 * directly for an is_custom subscription would silently under/over-report revenue.
 */
export function effectiveMonthlyPrice(sub: {
  is_custom?: boolean | null
  custom_price_monthly?: number | null
  billing_cycle?: string | null
  plans?: { price_monthly: number; price_yearly: number | null } | null
}): number {
  if (sub.is_custom) return sub.custom_price_monthly ?? 0
  const plan = sub.plans
  if (!plan) return 0
  return sub.billing_cycle === 'yearly'
    ? (plan.price_yearly ?? plan.price_monthly * 12) / 12
    : plan.price_monthly
}
