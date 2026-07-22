/**
 * GET /api/cron/reconcile-subscriptions
 *
 * Safety net for dropped/misrouted Stripe webhooks: re-checks every
 * non-suspended subscription's live status against Stripe and corrects drift.
 * Intended to be called daily by an external cron (cron-job.org, GitHub
 * Actions, Supabase pg_cron) — same pattern as /api/cron/invoice-reminders.
 *
 * Security: requires CRON_SECRET header/param to match CRON_SECRET env var.
 */
import { NextRequest, NextResponse } from 'next/server'
import { SubscriptionSyncService } from '@/backend/services/subscription-sync.service'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const provided = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const result = await SubscriptionSyncService.reconcileAllFromStripe()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/reconcile-subscriptions]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
