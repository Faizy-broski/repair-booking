/**
 * POST /api/admin/subscriptions/sync-live
 *
 * Super-admin only. Iterates every subscription that has a stripe_sub_id
 * and checks it against the current Stripe API key. If Stripe returns the
 * subscription successfully it is live; if it throws "No such subscription"
 * it is a test-mode record. Updates subscriptions.livemode accordingly.
 *
 * Run once after deploying the 087_subscriptions_livemode migration to
 * correctly classify existing data.
 */
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { withMiddleware } from '@/backend/middleware'
import type { RequestContext } from '@/backend/middleware'
import { createAdminClient } from '@/backend/config/supabase'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2026-02-25.clover' as any,
})

async function handler(_req: Request, _ctx: RequestContext) {
  const supabase = createAdminClient()

  // Fetch all subscriptions that have a Stripe sub ID
  const { data: subs, error } = await (supabase as any)
    .from('subscriptions')
    .select('id, stripe_sub_id, livemode')
    .not('stripe_sub_id', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let live = 0, test = 0, skipped = 0

  await Promise.all(
    (subs ?? []).map(async (sub: { id: string; stripe_sub_id: string; livemode: boolean }) => {
      try {
        const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_sub_id)
        const isLive = stripeSub.livemode
        await (supabase as any)
          .from('subscriptions')
          .update({ livemode: isLive })
          .eq('id', sub.id)
        isLive ? live++ : test++
      } catch (err: any) {
        // "No such subscription" → it's from the opposite mode; mark false
        if (err?.code === 'resource_missing') {
          await (supabase as any)
            .from('subscriptions')
            .update({ livemode: false })
            .eq('id', sub.id)
          test++
        } else {
          console.error('[sync-live] Stripe error for', sub.stripe_sub_id, err?.message)
          skipped++
        }
      }
    })
  )

  return NextResponse.json({ ok: true, live, test, skipped })
}

export const POST = withMiddleware(handler, { requiredRole: 'super_admin', skipTenant: true })
