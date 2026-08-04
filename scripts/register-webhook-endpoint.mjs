/**
 * One-off script: registers a Stripe webhook endpoint pointing at the
 * current, actively-maintained handler (src/app/api/stripe/webhook/route.ts),
 * for whichever mode STRIPE_SECRET_KEY belongs to (test or live).
 *
 * IMPORTANT: the returned `secret` (whsec_...) is only ever shown once, at
 * creation time. Copy it into STRIPE_WEBHOOK_SECRET immediately — Stripe
 * cannot show it to you again afterwards (you'd have to roll the endpoint's
 * secret and update it again).
 *
 * Run from the project root:
 *   node --env-file=.env.local scripts/register-webhook-endpoint.mjs
 */

import Stripe from 'stripe'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const WEBHOOK_URL = 'https://repairbooking.co.uk/api/stripe/webhook'

if (!STRIPE_SECRET_KEY) {
  console.error('Missing STRIPE_SECRET_KEY')
  process.exit(1)
}

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover' })

// Matches exactly what src/app/api/stripe/webhook/route.ts switches on.
const ENABLED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
]

const endpoint = await stripe.webhookEndpoints.create({
  url: WEBHOOK_URL,
  enabled_events: ENABLED_EVENTS,
  description: 'repair-booking — subscription billing sync',
})

console.log(`Webhook endpoint created: ${endpoint.id}`)
console.log(`Mode: ${endpoint.livemode ? 'LIVE' : 'TEST'}`)
console.log(`URL: ${endpoint.url}`)
console.log(`Events: ${endpoint.enabled_events.join(', ')}`)
console.log('')
console.log(`Signing secret (SAVE THIS NOW — shown only once): ${endpoint.secret}`)
console.log('Set STRIPE_WEBHOOK_SECRET to the value above in this environment.')
