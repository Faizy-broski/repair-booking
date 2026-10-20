/**
 * PlanCheckoutService
 *
 * Shared Stripe Checkout logic for paying for a plan — used by:
 *  - /api/auth/register          (new self-registered business, pays before access)
 *  - /api/stripe/upgrade          (existing business, fixed plan)
 *  - /api/stripe/upgrade-custom   (existing business, Custom Plan)
 *
 * and the matching confirmation step used by:
 *  - /api/auth/check-registration (signup success page)
 *  - /api/stripe/verify-upgrade   (upgrade success redirect)
 *
 * No trial is ever attached here — trials are only granted by a superadmin
 * (see /api/admin/subscriptions/[businessId]/grant-trial).
 */
import Stripe from 'stripe'
import { createAdminClient } from '@/backend/config/supabase'
import { SubscriptionSyncService } from '@/backend/services/subscription-sync.service'
import { invalidateBusinessCache } from '@/backend/services/module-config.service'
import { SubscriptionEmailService } from '@/backend/services/subscription-email.service'
import { CUSTOM_PLAN_YEARLY_DISCOUNT, customMonthlyPriceFromMetadata, type CustomPlanDimensions } from '@/backend/services/custom-plan-pricing'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-02-25.clover' })

// Test-mode keys (local dev) can't see live-mode prices/tax rates stored in the DB.
const IS_TEST_KEY = /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY ?? '')

function isMissingResource(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'resource_missing'
}

/** True if a cached Stripe price ID exists in the current key's mode. */
async function priceExists(priceId: string): Promise<boolean> {
  try {
    const price = await stripe.prices.retrieve(priceId)
    return price.active
  } catch (err) {
    if (isMissingResource(err)) return false
    throw err
  }
}

let vatRateCache: { id: string; ok: boolean } | null = null
/**
 * Returns the VAT tax rate ID to apply, or null. In live mode a missing rate is
 * a hard error (never silently drop VAT); with a test key it's skipped with a
 * warning so local checkout still works against a live-mode rate ID.
 */
async function resolveVatTaxRateId(id: string | null | undefined): Promise<string | null> {
  if (!id) return null
  if (vatRateCache?.id === id) return vatRateCache.ok ? id : null
  try {
    await stripe.taxRates.retrieve(id)
    vatRateCache = { id, ok: true }
    return id
  } catch (err) {
    if (isMissingResource(err) && IS_TEST_KEY) {
      console.warn(`[plan-checkout] STRIPE_VAT_TAX_RATE_ID ${id} not found with the test key — checkout will run without VAT. Create a test-mode tax rate to test VAT.`)
      vatRateCache = { id, ok: false }
      return null
    }
    throw err
  }
}

export class PlanCheckoutError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

export type CheckoutTarget =
  | { kind: 'plan'; planId: string }
  /** Both recomputed server-side: totalPence = charge per billing cycle (annual total
   *  for yearly), monthlyPence = the plan's monthly price stored on the subscription. */
  | { kind: 'custom'; dims: CustomPlanDimensions; totalPence: number; monthlyPence: number }

export async function createPlanCheckoutSession(opts: {
  businessId: string
  email: string
  target: CheckoutTarget
  billingCycle: 'monthly' | 'yearly'
  successUrl: string
  cancelUrl: string
  source: 'signup' | 'upgrade'
}): Promise<{ url: string; sessionId: string }> {
  const { businessId, email, target, billingCycle, successUrl, cancelUrl, source } = opts
  const supabase = createAdminClient()

  let lineItem: Stripe.Checkout.SessionCreateParams.LineItem
  let metadata: Record<string, string>

  if (target.kind === 'plan') {
    // Look up plan — fetch the monthly price ID (still cached/reused) and
    // the raw monthly price (yearly is always derived from this, never a
    // stored price_yearly — see CUSTOM_PLAN_YEARLY_DISCOUNT).
    const { data: planRow, error: planErr } = await (supabase as any)
      .from('plans')
      .select('id, name, stripe_price_id_monthly, plan_type, price_monthly')
      .eq('id', target.planId)
      .eq('is_active', true)
      .single()

    const plan = planRow as {
      id: string; name: string
      stripe_price_id_monthly: string | null
      plan_type: string
      price_monthly: number
    } | null
    if (planErr || !plan) throw new PlanCheckoutError('Plan not found', 400)
    if (plan.price_monthly <= 0) {
      throw new PlanCheckoutError(`Plan "${plan.name}" has no monthly price configured.`, 500)
    }

    // Yearly is always a flat 10% off the current monthly price, built as an
    // inline price_data line item — never a persisted/cached Price, so a
    // future price_monthly change (or the discount rate itself) can't leave
    // stale customers on an outdated cached yearly Price. Monthly keeps the
    // existing cached-Price-reuse pattern since its price doesn't change
    // based on billing cycle.
    if (billingCycle === 'yearly') {
      const unitAmount = Math.round(plan.price_monthly * 12 * (1 - CUSTOM_PLAN_YEARLY_DISCOUNT) * 100)
      lineItem = {
        price_data: {
          currency: 'gbp',
          product_data: { name: plan.name },
          unit_amount: unitAmount,
          recurring: { interval: 'year' },
        },
        quantity: 1,
      }
    } else if (plan.stripe_price_id_monthly && IS_TEST_KEY && !(await priceExists(plan.stripe_price_id_monthly))) {
      // Stored price belongs to the other Stripe mode (e.g. live price, test key in
      // local dev) — use an inline price and leave the stored ID untouched.
      lineItem = {
        price_data: {
          currency: 'gbp',
          product_data: { name: plan.name },
          unit_amount: Math.round(plan.price_monthly * 100),
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }
    } else {
      let stripePriceId = plan.stripe_price_id_monthly
      if (!stripePriceId) {
        const product = await stripe.products.create({ name: plan.name })
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: Math.round(plan.price_monthly * 100),
          currency: 'gbp',
          recurring: { interval: 'month' },
        })
        stripePriceId = price.id

        // Persist so we don't recreate next time
        await (supabase as any)
          .from('plans')
          .update({ stripe_price_id_monthly: stripePriceId })
          .eq('id', target.planId)
      }
      lineItem = { price: stripePriceId, quantity: 1 }
    }

    metadata = { businessId, planId: target.planId, billingCycle }
  } else {
    const { dims, totalPence, monthlyPence } = target
    lineItem = {
      price_data: {
        currency: 'gbp',
        product_data: { name: 'Custom Plan' },
        unit_amount: totalPence,
        recurring: { interval: billingCycle === 'yearly' ? 'year' : 'month' },
      },
      quantity: 1,
    }
    // Dimension values are passed through as metadata (strings) so the
    // checkout.session.completed webhook / verify-upgrade can write
    // is_custom + custom_* onto the subscriptions row on confirmation —
    // there's no shared plan row to look these up from.
    metadata = {
      businessId,
      isCustom:         'true',
      customBranches:   String(dims.branches),
      customStaff:      String(dims.staff),
      customInventory:  dims.inventoryLimit === null ? 'unlimited' : String(dims.inventoryLimit),
      customRepair:     dims.repairLimit === null ? 'unlimited' : String(dims.repairLimit),
      customPricePence: String(totalPence),
      customMonthlyPricePence: String(monthlyPence),
      billingCycle,
    }
  }

  if (source === 'signup') metadata.source = 'signup'

  const { data: bizRow } = await (supabase as any)
    .from('businesses')
    .select('stripe_customer_id, vat_exempt')
    .eq('id', businessId)
    .single()
  const business = bizRow as { stripe_customer_id?: string | null; vat_exempt?: boolean | null } | null

  // Validate the stored customer ID against the current Stripe mode (test vs live).
  // A test-mode customer ID silently breaks when live keys are used, so we verify
  // first and fall back to email — clearing the stale ID so it doesn't re-poison future calls.
  let customerParam: Stripe.Checkout.SessionCreateParams
  if (business?.stripe_customer_id) {
    try {
      const existing = await stripe.customers.retrieve(business.stripe_customer_id)
      if ((existing as Stripe.DeletedCustomer).deleted) throw new Error('deleted')
      customerParam = { customer: business.stripe_customer_id }
    } catch {
      await (supabase as any)
        .from('businesses')
        .update({ stripe_customer_id: null })
        .eq('id', businessId)
      customerParam = { customer_email: email }
    }
  } else {
    customerParam = { customer_email: email }
  }

  // Never attach VAT for a business flagged vat_exempt (see migration
  // 200_business_vat_exempt.sql), otherwise a plan change would silently
  // re-add VAT for them.
  const vatTaxRateId = business?.vat_exempt ? null : await resolveVatTaxRateId(process.env.STRIPE_VAT_TAX_RATE_ID)

  const session = await stripe.checkout.sessions.create({
    ...customerParam,
    mode: 'subscription',
    line_items: [{
      ...lineItem,
      ...(vatTaxRateId ? { tax_rates: [vatTaxRateId] } : {}),
    }],
    subscription_data: {
      metadata,
      ...(vatTaxRateId ? { default_tax_rates: [vatTaxRateId] } : {}),
    },
    metadata,
    success_url: successUrl,
    cancel_url:  cancelUrl,
  } as Stripe.Checkout.SessionCreateParams)

  if (!session.url) throw new PlanCheckoutError('Stripe did not return a checkout URL', 500)
  return { url: session.url, sessionId: session.id }
}

/**
 * Confirm a completed Checkout session and write the paid subscription to the
 * DB. Idempotent — safe to run alongside (or after) the checkout.session.completed
 * webhook, which writes the same state.
 *
 * Throws PlanCheckoutError if the session isn't paid or lacks metadata.
 */
export async function activateFromCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<{ businessId: string; planId: string; plan: unknown }> {
  // 'paid' = immediate charge succeeded
  // 'no_payment_required' = £0 due today (e.g. 100% coupon) — still a confirmed subscription
  const validPaymentStatus = session.payment_status === 'paid' || session.payment_status === 'no_payment_required'
  if (!validPaymentStatus || session.mode !== 'subscription') {
    throw new PlanCheckoutError('Payment not completed', 400)
  }

  const businessId = session.metadata?.businessId
  const isCustom   = session.metadata?.isCustom === 'true'
  const planId     = session.metadata?.planId
  if (!businessId || (!planId && !isCustom)) {
    throw new PlanCheckoutError('Missing metadata in Stripe session', 400)
  }
  const billingCycle = session.metadata?.billingCycle === 'yearly' ? 'yearly' : 'monthly'

  const supabase = createAdminClient()

  const stripeSubId = typeof session.subscription === 'string'
    ? session.subscription
    : (session.subscription as Stripe.Subscription | null)?.id ?? null

  // Fetch period dates from the Stripe subscription
  let periodStart: string | null = null
  let periodEnd: string | null = null
  if (stripeSubId) {
    try {
      const stripeSub = await stripe.subscriptions.retrieve(stripeSubId, { expand: ['items'] })
      const item = stripeSub.items?.data?.[0] as any
      const rawStart = (stripeSub as any).current_period_start ?? item?.current_period_start
      const rawEnd   = (stripeSub as any).current_period_end   ?? item?.current_period_end
      periodStart = rawStart ? new Date(rawStart * 1000).toISOString() : null
      periodEnd   = rawEnd   ? new Date(rawEnd   * 1000).toISOString() : null
    } catch { /* non-fatal */ }
  }

  // Resolve the placeholder "Custom Plan" id when applicable — every custom
  // total is unique (built via price_data), so there's no shared plans row
  // to look the numbers up from; they travel as session metadata instead.
  let resolvedPlanId = planId ?? null
  if (isCustom) {
    const { data: customPlanRow } = await (supabase as any)
      .from('plans')
      .select('id')
      .eq('plan_type', 'custom')
      .single()
    resolvedPlanId = (customPlanRow as { id: string } | null)?.id ?? null
    if (!resolvedPlanId) throw new PlanCheckoutError('Custom plan is not configured yet.', 500)
  }

  // Capture any pre-existing (different) subscription BEFORE we overwrite
  // it below — needed for the upgrade-trap proration/cancel step.
  const { data: existingSub } = await (supabase as any)
    .from('subscriptions')
    .select('stripe_sub_id')
    .eq('business_id', businessId)
    .maybeSingle()
  const oldStripeSubId = (existingSub as { stripe_sub_id: string | null } | null)?.stripe_sub_id ?? null

  // Activate business
  await (supabase as any)
    .from('businesses')
    .update({
      is_active:              true,
      stripe_customer_id:     session.customer ?? null,
      stripe_subscription_id: stripeSubId,
      trial_ends_at:          null,
    })
    .eq('id', businessId)

  const inventoryStr = session.metadata?.customInventory
  const repairStr    = session.metadata?.customRepair

  // Upsert subscription (idempotent — safe if webhook already ran)
  await SubscriptionSyncService.upsert({
    businessId,
    planId: resolvedPlanId!,
    stripeSubId,
    stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
    status: 'active',
    billingCycle,
    trialEndsAt: null,
    currentPeriodStart: periodStart,
    currentPeriodEnd:   periodEnd,
    livemode: session.livemode,
    ...(isCustom
      ? {
          customOverrides: {
            maxBranches:  Number(session.metadata?.customBranches ?? 1),
            maxUsers:     Number(session.metadata?.customStaff ?? 5),
            maxProducts:  inventoryStr === 'unlimited' ? null : Number(inventoryStr),
            maxServices:  repairStr === 'unlimited' ? null : Number(repairStr),
            priceMonthly: customMonthlyPriceFromMetadata(session.metadata),
          },
        }
      : {}),
  })

  // Bust Next.js data cache so module configs serve the new plan immediately
  await invalidateBusinessCache(businessId)

  // ── Upgrade-trap fix (same idempotency key scheme as the webhook, so
  // whichever of the two routes runs first performs the credit/cancel and
  // the other is a safe no-op) ──────────────────────────────────────────
  if (oldStripeSubId && oldStripeSubId !== stripeSubId) {
    try {
      const oldSub = await stripe.subscriptions.retrieve(oldStripeSubId, { expand: ['items'] })
      const oldItem = oldSub.items?.data?.[0] as any
      const oldRawStart = (oldSub as any).current_period_start ?? oldItem?.current_period_start
      const oldRawEnd   = (oldSub as any).current_period_end   ?? oldItem?.current_period_end
      const oldUnitAmount = oldItem?.price?.unit_amount ?? 0
      const customerId = typeof session.customer === 'string'
        ? session.customer
        : (typeof oldSub.customer === 'string' ? oldSub.customer : null)

      if (oldRawStart && oldRawEnd && oldUnitAmount > 0 && customerId) {
        const startMs = oldRawStart * 1000
        const endMs   = oldRawEnd * 1000
        const totalMs = endMs - startMs
        const unusedFraction = totalMs > 0 ? Math.max(0, Math.min(1, (endMs - Date.now()) / totalMs)) : 0
        const creditPence = Math.round(oldUnitAmount * unusedFraction)

        if (creditPence > 0) {
          await stripe.customers.createBalanceTransaction(
            customerId,
            {
              amount: -creditPence,
              currency: oldSub.currency ?? 'gbp',
              description: 'Unused time credit from previous plan',
            },
            { idempotencyKey: `prorate_credit_${oldStripeSubId}_${session.id}` }
          )
        }
      }

      await stripe.subscriptions.cancel(oldStripeSubId)
    } catch (err) {
      console.error('[plan-checkout] upgrade-trap proration/cancel failed for', oldStripeSubId, err)
    }
  }

  const { data: plan } = await (supabase as any)
    .from('plans')
    .select('name, plan_type, features')
    .eq('id', resolvedPlanId)
    .single()

  // Fire subscription confirmation emails (owner + super-admin).
  // Intentionally NOT awaited — email delivery must never block the UI response.
  SubscriptionEmailService.sendNewSubscriptionEmails(businessId, resolvedPlanId!, periodEnd)

  return { businessId, planId: resolvedPlanId!, plan }
}
