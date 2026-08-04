/**
 * One-off diagnostic: lists registered Stripe webhook endpoints for the
 * current key's mode, so we can confirm which route (the current
 * src/app/api/stripe/webhook/route.ts or the legacy
 * src/app/api/webhooks/stripe/route.ts) is actually receiving events
 * before shipping VAT-related webhook changes.
 *
 * Run from the project root:
 *   node --env-file=.env.local scripts/check-webhook-endpoints.mjs
 */

import Stripe from 'stripe'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

if (!STRIPE_SECRET_KEY) {
  console.error('Missing STRIPE_SECRET_KEY')
  process.exit(1)
}

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover' })

const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })

if (endpoints.data.length === 0) {
  console.log('No webhook endpoints registered for this key/mode.')
} else {
  for (const ep of endpoints.data) {
    console.log(`- ${ep.url}`)
    console.log(`  id: ${ep.id}, status: ${ep.status}, livemode: ${ep.livemode}`)
    console.log(`  events: ${ep.enabled_events.join(', ')}`)
  }
}
