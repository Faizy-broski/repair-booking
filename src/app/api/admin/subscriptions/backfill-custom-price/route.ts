/**
 * POST /api/admin/subscriptions/backfill-custom-price
 *
 * Super-admin only. One-time correction for Custom Plan subscriptions whose
 * Stripe price drifted from the locally-negotiated custom_price_monthly —
 * e.g. businesses moved to a Custom Plan before the admin PATCH route
 * started pushing price changes to Stripe. Idempotent — skips subscriptions
 * whose Stripe price already matches.
 *
 * Pass ?dryRun=true to log what would change without calling Stripe's
 * update endpoint.
 */
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { withMiddleware } from '@/backend/middleware'
import type { RequestContext } from '@/backend/middleware'
import { createAdminClient } from '@/backend/config/supabase'
import { CUSTOM_PLAN_YEARLY_DISCOUNT, getOrCreateCustomPlanStripeProductId } from '@/backend/services/custom-plan-pricing'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2026-02-25.clover' as any,
})

const BATCH_SIZE = 15

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function handler(req: Request, _ctx: RequestContext) {
  const dryRun = new URL(req.url).searchParams.get('dryRun') === 'true'
  const supabase = createAdminClient()

  type SubRow = {
    id: string
    business_id: string
    stripe_sub_id: string
    billing_cycle: string | null
    custom_price_monthly: number | null
  }

  const { data: subs, error } = await (supabase as any)
    .from('subscriptions')
    .select('id, business_id, stripe_sub_id, billing_cycle, custom_price_monthly')
    .eq('is_custom', true)
    .in('status', ['active', 'trialing', 'past_due'])
    .not('stripe_sub_id', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let updated = 0, alreadySet = 0, errors = 0
  const log: { businessId: string; stripeSubId: string; result: string }[] = []

  for (const batch of chunk<SubRow>(subs ?? [], BATCH_SIZE)) {
    await Promise.all(
      batch.map(async (sub: SubRow) => {
        try {
          if (sub.custom_price_monthly == null) {
            log.push({ businessId: sub.business_id, stripeSubId: sub.stripe_sub_id, result: 'skipped: no custom_price_monthly' })
            return
          }

          const monthlyPence = Math.round(sub.custom_price_monthly * 100)
          const totalPence = sub.billing_cycle === 'yearly'
            ? Math.round(monthlyPence * 12 * (1 - CUSTOM_PLAN_YEARLY_DISCOUNT))
            : monthlyPence

          const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_sub_id)
          const item = stripeSub.items.data[0]
          if (!item) {
            errors++
            log.push({ businessId: sub.business_id, stripeSubId: sub.stripe_sub_id, result: 'error: no line items' })
            return
          }

          if (item.price.unit_amount === totalPence) {
            alreadySet++
            log.push({ businessId: sub.business_id, stripeSubId: sub.stripe_sub_id, result: `already_set (${totalPence}p)` })
            return
          }

          if (dryRun) {
            updated++
            log.push({
              businessId: sub.business_id,
              stripeSubId: sub.stripe_sub_id,
              result: `would_update: ${item.price.unit_amount}p -> ${totalPence}p`,
            })
            return
          }

          const productId = await getOrCreateCustomPlanStripeProductId(stripe)
          await stripe.subscriptions.update(sub.stripe_sub_id, {
            items: [{
              id: item.id,
              price_data: {
                currency: 'gbp',
                product: productId,
                unit_amount: totalPence,
                recurring: { interval: sub.billing_cycle === 'yearly' ? 'year' : 'month' },
              },
            }],
            proration_behavior: 'create_prorations',
          })
          updated++
          log.push({
            businessId: sub.business_id,
            stripeSubId: sub.stripe_sub_id,
            result: `updated: ${item.price.unit_amount}p -> ${totalPence}p`,
          })
        } catch (err: any) {
          errors++
          console.error('[backfill-custom-price] Stripe error for', sub.stripe_sub_id, err?.message)
          log.push({ businessId: sub.business_id, stripeSubId: sub.stripe_sub_id, result: `error: ${err?.message}` })
        }
      })
    )
  }

  return NextResponse.json({ ok: true, dryRun, total: subs?.length ?? 0, updated, alreadySet, errors, log })
}

export const POST = withMiddleware(handler, { requiredRole: 'super_admin', skipTenant: true })
