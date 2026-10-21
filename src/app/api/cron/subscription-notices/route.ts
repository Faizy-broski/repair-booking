/**
 * GET /api/cron/subscription-notices
 *
 * ONCE A DAY. Reminders for manual (bank transfer / cash) subscriptions, which
 * have no billing event of their own:
 *   - 3 days before the subscription ends
 *   - the "24h grace" notice, sent the day it ends (so it always arrives
 *     before access locks)
 * Card subscriptions don't need this — their notice is sent straight from the
 * Stripe invoice.payment_failed webhook.
 *
 * Each business gets each notice at most once per cycle (deduped in
 * subscription_notices), so an extra run never re-sends anything.
 *
 * Security: fails closed — requires CRON_SECRET via x-cron-secret header or ?secret=.
 */
import { NextRequest, NextResponse } from 'next/server'
import { SubscriptionNoticeService } from '@/backend/services/subscription-notice.service'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron/subscription-notices] CRON_SECRET is not set — refusing all requests')
    return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET is not set' }, { status: 500 })
  }
  const provided = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (provided !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await SubscriptionNoticeService.runDailyManualReminders()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/subscription-notices]', err)
    return NextResponse.json({ error: 'Failed to process subscription notices' }, { status: 500 })
  }
}
