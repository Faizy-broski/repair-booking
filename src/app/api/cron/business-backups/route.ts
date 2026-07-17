/**
 * GET /api/cron/business-backups?action=schedule|process|cleanup
 *
 * Daily per-business JSON backup system. Intended to be called by an external
 * cron (VPS crontab or cron-job.org) in three sequential passes:
 *
 *   1. ?action=schedule  — seeds today's backup_registry rows for all active businesses
 *   2. ?action=process   — picks ONE pending row and exports it to Supabase Storage
 *      (call multiple times — once per business that needs backing up)
 *   3. ?action=cleanup   — deletes storage files and registry rows older than 30 days
 *
 * Security: requires CRON_SECRET env var match via x-cron-secret header or ?secret= param.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  scheduleBackupsForToday,
  processNextPendingBackup,
  cleanupOldBackups,
} from '@/backend/services/backup.service'

export async function GET(req: NextRequest) {
  // Fail closed: an unset CRON_SECRET must never mean "no auth required" — that
  // would leave this endpoint (which triggers real data exports and storage
  // writes) open to anyone on the internet. Misconfiguration is a 500, not a
  // silent bypass.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron/business-backups] CRON_SECRET is not set — refusing all requests')
    return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET is not set' }, { status: 500 })
  }
  const provided = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const action = req.nextUrl.searchParams.get('action') ?? 'process'

  try {
    if (action === 'schedule') {
      const count = await scheduleBackupsForToday()
      return NextResponse.json({ ok: true, action, scheduled: count })
    }

    if (action === 'process') {
      const result = await processNextPendingBackup()
      if (!result.processed) {
        return NextResponse.json({ ok: true, action, message: 'No pending backups for today' })
      }
      if (result.error) {
        return NextResponse.json({
          ok: false,
          action,
          businessId: result.businessId,
          error: result.error,
        }, { status: 500 })
      }
      return NextResponse.json({
        ok: true,
        action,
        businessId:   result.businessId,
        sizeBytes:    result.result?.sizeBytes,
        recordCounts: result.result?.recordCounts,
      })
    }

    if (action === 'cleanup') {
      const { deleted } = await cleanupOldBackups()
      return NextResponse.json({ ok: true, action, deleted })
    }

    return NextResponse.json(
      { error: `Unknown action "${action}". Use schedule, process, or cleanup.` },
      { status: 400 },
    )
  } catch (err) {
    console.error(`[cron/business-backups] action=${action}`, err)
    return NextResponse.json(
      { ok: false, action, error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
