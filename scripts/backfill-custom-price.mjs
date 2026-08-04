#!/usr/bin/env node
/**
 * One-off backfill: syncs every existing Custom Plan subscription's Stripe
 * price to match its locally-stored custom_price_monthly. Needed because,
 * before this fix, saving a Custom Plan via the admin Edit Subscription
 * modal never pushed the price to Stripe — so any business moved onto a
 * Custom Plan before now is still being billed at Stripe's original price.
 *
 * Safe by default: with no flags this only LOGS what it would change — it
 * makes no writes to Stripe or the database. Pass --apply to actually
 * update Stripe subscriptions (with an immediate prorated adjustment).
 * Idempotent — running it again after --apply is a no-op for anything
 * already fixed.
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill-custom-price.mjs            (dry run)
 *   node --env-file=.env.local scripts/backfill-custom-price.mjs --apply    (writes to Stripe)
 */

import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
  console.error('ERROR: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and STRIPE_SECRET_KEY must be set.')
  console.error('Run with: node --env-file=.env.local scripts/backfill-custom-price.mjs [--apply]')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')

// Mirrors CUSTOM_PLAN_YEARLY_DISCOUNT in src/backend/services/custom-plan-pricing.ts
// (single source of truth — this script can't import that .ts file directly).
const CUSTOM_PLAN_YEARLY_DISCOUNT = 0.10

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover' })

console.log(`Mode: ${APPLY ? 'APPLY (will update Stripe)' : 'DRY RUN (no writes)'}`)
console.log(`Stripe key: ${STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST'}`)
console.log('')

const { data: subs, error } = await supabase
  .from('subscriptions')
  .select('id, business_id, stripe_sub_id, billing_cycle, custom_price_monthly, businesses(name)')
  .eq('is_custom', true)
  .in('status', ['active', 'trialing', 'past_due'])
  .not('stripe_sub_id', 'is', null)

if (error) {
  console.error('Query error:', error.message)
  process.exit(1)
}

console.log(`Found ${subs.length} custom-plan subscription(s) with a linked Stripe subscription.\n`)

let cachedProductId = null
async function getOrCreateCustomPlanProductId() {
  if (cachedProductId) return cachedProductId
  const { data } = await stripe.products.list({ active: true, limit: 100 })
  const existing = data.find((p) => p.name === 'Custom Plan')
  const product = existing ?? (APPLY ? await stripe.products.create({ name: 'Custom Plan' }) : { id: '(would create)' })
  cachedProductId = product.id
  return product.id
}

let updated = 0, alreadySet = 0, errors = 0

for (const sub of subs) {
  const businessName = sub.businesses?.name ?? sub.business_id
  try {
    if (sub.custom_price_monthly == null) {
      console.log(`SKIP  ${businessName}: no custom_price_monthly set`)
      continue
    }

    const monthlyPence = Math.round(sub.custom_price_monthly * 100)
    const totalPence = sub.billing_cycle === 'yearly'
      ? Math.round(monthlyPence * 12 * (1 - CUSTOM_PLAN_YEARLY_DISCOUNT))
      : monthlyPence

    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_sub_id)
    const item = stripeSub.items.data[0]
    if (!item) {
      errors++
      console.log(`ERROR ${businessName}: Stripe subscription ${sub.stripe_sub_id} has no line items`)
      continue
    }

    if (item.price.unit_amount === totalPence) {
      alreadySet++
      console.log(`OK    ${businessName}: already £${(totalPence / 100).toFixed(2)}`)
      continue
    }

    const fromStr = `£${(item.price.unit_amount / 100).toFixed(2)}`
    const toStr = `£${(totalPence / 100).toFixed(2)}`

    if (!APPLY) {
      updated++
      console.log(`WOULD UPDATE  ${businessName}: ${fromStr} -> ${toStr}`)
      continue
    }

    const productId = await getOrCreateCustomPlanProductId()
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
    console.log(`UPDATED       ${businessName}: ${fromStr} -> ${toStr}`)
  } catch (err) {
    errors++
    console.log(`ERROR ${businessName}: ${err.message}`)
  }
}

console.log('')
console.log(`Total: ${subs.length}  Updated: ${updated}  Already correct: ${alreadySet}  Errors: ${errors}`)
if (!APPLY && updated > 0) {
  console.log('\nThis was a dry run — nothing was changed. Re-run with --apply to actually update Stripe.')
}
