import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { withMiddleware } from '@/backend/middleware'
import type { RequestContext } from '@/backend/middleware'
import { createAdminClient } from '@/backend/config/supabase'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-02-25.clover' as any })

/**
 * PATCH /api/admin/subscriptions/[businessId]/vat-exempt
 *
 * Toggles businesses.vat_exempt and, if the business has a live Stripe
 * subscription, immediately mutates its default_tax_rates to match — a
 * tax-rate-only subscriptions.update() call, same as backfill-vat/route.ts
 * uses, which does NOT generate a proration invoice and does not touch
 * status/current_period_end/plan_id/billing_cycle. No new Checkout Session,
 * so the business's existing billing cycle is left completely undisturbed.
 */
async function handler(
  request: NextRequest,
  _ctx: RequestContext,
  routeCtx: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await routeCtx.params
  const supabase = createAdminClient()

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { vatExempt } = body ?? {}
  if (typeof vatExempt !== 'boolean') {
    return NextResponse.json({ error: 'vatExempt must be a boolean' }, { status: 400 })
  }

  const { data: business, error: bizErr } = await (supabase as any)
    .from('businesses')
    .select('id, name')
    .eq('id', businessId)
    .single()

  if (bizErr || !business) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  const { error: updateErr } = await (supabase as any)
    .from('businesses')
    .update({ vat_exempt: vatExempt })
    .eq('id', businessId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // ── Sync the live Stripe subscription, if one exists ────────────────────────
  let stripeSynced: boolean | null = null
  let stripeSyncError: string | null = null

  const { data: sub } = await (supabase as any)
    .from('subscriptions')
    .select('stripe_sub_id')
    .eq('business_id', businessId)
    .maybeSingle()

  if (sub?.stripe_sub_id) {
    const vatTaxRateId = process.env.STRIPE_VAT_TAX_RATE_ID
    try {
      // Stripe requires the literal empty string to CLEAR default_tax_rates —
      // an empty array [] is a no-op and silently leaves the existing rate(s)
      // in place (confirmed against a live subscription before shipping this).
      await stripe.subscriptions.update(sub.stripe_sub_id, {
        default_tax_rates: vatExempt ? '' : (vatTaxRateId ? [vatTaxRateId] : ''),
      })
      stripeSynced = true
    } catch (err: any) {
      stripeSynced = false
      stripeSyncError = err?.message ?? 'Failed to update Stripe subscription'
      console.error('[vat-exempt PATCH] Stripe sync error:', stripeSyncError)
    }
  }

  return NextResponse.json({
    ok: true,
    business: business.name,
    vatExempt,
    ...(stripeSynced !== null ? { stripeSynced } : {}),
    ...(stripeSyncError ? { stripeSyncError } : {}),
  })
}

export const PATCH = withMiddleware(handler, { requiredRole: 'super_admin', skipTenant: true })
