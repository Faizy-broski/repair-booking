/**
 * POST /api/admin/subscriptions/backfill-vat
 *
 * Super-admin only. Attaches the VAT tax rate (STRIPE_VAT_TAX_RATE_ID) to
 * every active/trialing subscription's default_tax_rates, so their NEXT
 * renewal invoice includes VAT. Idempotent — skips subscriptions that
 * already carry the rate. Does not touch proration_behavior: a tax-rate-only
 * change does not generate a proration invoice (verified in Stripe test
 * mode before running this against live subscriptions).
 *
 * Pass ?dryRun=true to log what would change without calling Stripe's
 * update endpoint.
 */
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { withMiddleware } from '@/backend/middleware'
import type { RequestContext } from '@/backend/middleware'
import { createAdminClient } from '@/backend/config/supabase'

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
  const taxRateId = process.env.STRIPE_VAT_TAX_RATE_ID
  if (!taxRateId) {
    return NextResponse.json({ error: 'STRIPE_VAT_TAX_RATE_ID is not set' }, { status: 500 })
  }

  const dryRun = new URL(req.url).searchParams.get('dryRun') === 'true'
  const supabase = createAdminClient()

  type SubRow = { id: string; business_id: string; stripe_sub_id: string }

  const { data: allSubs, error } = await (supabase as any)
    .from('subscriptions')
    .select('id, business_id, stripe_sub_id')
    .in('status', ['active', 'trialing'])
    .not('stripe_sub_id', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Never re-attach VAT for a business flagged vat_exempt (see migration
  // 200_business_vat_exempt.sql) — a negotiated exemption must survive
  // future re-runs of this bulk backfill.
  const { data: exemptBiz } = await (supabase as any)
    .from('businesses')
    .select('id')
    .eq('vat_exempt', true)
  const exemptIds = new Set((exemptBiz ?? []).map((b: { id: string }) => b.id))
  const subs: SubRow[] = (allSubs ?? []).filter((s: SubRow) => !exemptIds.has(s.business_id))
  const skippedExempt = (allSubs?.length ?? 0) - subs.length

  let updated = 0, alreadySet = 0, errors = 0
  const log: { businessId: string; stripeSubId: string; result: string }[] = []

  for (const batch of chunk<SubRow>(subs, BATCH_SIZE)) {
    await Promise.all(
      batch.map(async (sub: SubRow) => {
        try {
          const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_sub_id)
          const currentRateIds = (stripeSub.default_tax_rates ?? []).map((r: any) =>
            typeof r === 'string' ? r : r.id
          )

          if (currentRateIds.includes(taxRateId)) {
            alreadySet++
            log.push({ businessId: sub.business_id, stripeSubId: sub.stripe_sub_id, result: 'already_set' })
            return
          }

          if (dryRun) {
            updated++
            log.push({ businessId: sub.business_id, stripeSubId: sub.stripe_sub_id, result: 'would_update' })
            return
          }

          await stripe.subscriptions.update(sub.stripe_sub_id, {
            default_tax_rates: [taxRateId],
          })
          updated++
          log.push({ businessId: sub.business_id, stripeSubId: sub.stripe_sub_id, result: 'updated' })
        } catch (err: any) {
          errors++
          console.error('[backfill-vat] Stripe error for', sub.stripe_sub_id, err?.message)
          log.push({ businessId: sub.business_id, stripeSubId: sub.stripe_sub_id, result: `error: ${err?.message}` })
        }
      })
    )
  }

  return NextResponse.json({ ok: true, dryRun, total: subs.length, skippedExempt, updated, alreadySet, errors, log })
}

export const POST = withMiddleware(handler, { requiredRole: 'super_admin', skipTenant: true })
