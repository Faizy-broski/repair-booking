/**
 * GET /api/cron/invoice-reminders
 *
 * Processes invoice payment reminders for all businesses.
 * Intended to be called daily by an external cron (e.g. cron-job.org, GitHub Actions, Supabase pg_cron).
 *
 * Security: requires CRON_SECRET header to match CRON_SECRET env var.
 */
import { NextRequest, NextResponse } from 'next/server'
import { InvoiceReminderService } from '@/backend/services/notification-template.service'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const provided = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const result = await InvoiceReminderService.processAll()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/invoice-reminders]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
