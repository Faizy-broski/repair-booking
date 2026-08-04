/**
 * One-off script: creates the Stripe Tax Rate used for VAT on subscription
 * billing. Run once per Stripe mode (test key, then live key) — each mode
 * gets its own Tax Rate object with its own ID.
 *
 * Run from the project root:
 *   node --env-file=.env.local scripts/create-vat-tax-rate.mjs
 *
 * Copy the printed ID into STRIPE_VAT_TAX_RATE_ID for that environment.
 */

import Stripe from 'stripe'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

if (!STRIPE_SECRET_KEY) {
  console.error('Missing STRIPE_SECRET_KEY')
  process.exit(1)
}

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover' })

const taxRate = await stripe.taxRates.create({
  display_name: 'VAT',
  percentage: 20,
  inclusive: false,
  jurisdiction: 'GB',
  country: 'GB',
})

console.log(`Tax Rate created: ${taxRate.id}`)
console.log(`Mode: ${taxRate.livemode ? 'LIVE' : 'TEST'}`)
console.log(`Set STRIPE_VAT_TAX_RATE_ID=${taxRate.id} in this environment's env vars.`)
