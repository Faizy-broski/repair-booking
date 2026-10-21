/**
 * SubscriptionNoticeService — grace-period reminders (email + dashboard announcement).
 *
 * Event-driven, no polling:
 *  - Card (Stripe) subscriptions: notifyCardPaymentFailed() is called from the
 *    invoice.payment_failed webhook → dashboard announcement only (the webhook's
 *    existing payment-failed email already tells them about the 24h grace).
 *  - Manual (bank transfer / cash) subscriptions have no event when a date
 *    passes, so a ONCE-A-DAY cron (runDailyManualReminders) sends:
 *      'expiring_3d'   — ends in 1–3 days
 *      'grace_started' — ends within the next 24h or ended in the last 24h,
 *                        so the "24h grace" notice always lands BEFORE the lock.
 *
 * Each business gets each notice at most once per cycle: the log row is
 * inserted first against UNIQUE(business_id, kind, cycle_key); only a fresh
 * insert sends. Every step is try/caught — a failure never affects payments
 * or access.
 */
import { adminSupabase } from '@/backend/config/supabase'
import { EmailService } from '@/backend/services/email.service'
import { BroadcastService } from '@/backend/services/broadcast.service'
import { GRACE_MS } from '@/lib/subscription-access'

const db = (table: string): any => (adminSupabase as any).from(table) // eslint-disable-line @typescript-eslint/no-explicit-any

const DAY_MS = 24 * 60 * 60 * 1000

export type NoticeKind = 'expiring_3d' | 'grace_started'

interface Notice {
  businessId: string
  kind: NoticeKind
  cycleKey: string
  expiresAt: string
  graceEndsAt: string | null
}

let superAdminIdCache: string | null = null
async function systemAuthorId(): Promise<string | null> {
  if (superAdminIdCache) return superAdminIdCache
  const { data } = await db('profiles').select('id').eq('role', 'super_admin').limit(1).maybeSingle()
  superAdminIdCache = data?.id ?? null
  return superAdminIdCache
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString('en-GB', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
})

/** Claim (dedupe) + announcement + email for one notice. Returns what happened. */
async function deliver(n: Notice, { email = true }: { email?: boolean } = {}): Promise<string> {
  const { data: claimed, error: claimErr } = await db('subscription_notices')
    .upsert({ business_id: n.businessId, kind: n.kind, cycle_key: n.cycleKey }, { onConflict: 'business_id,kind,cycle_key', ignoreDuplicates: true })
    .select('id')
  if (claimErr) {
    console.warn('[subscription-notices] notice log unavailable (migration 211 applied?):', claimErr.message)
    return 'skipped (notice log unavailable)'
  }
  const noticeId = (claimed as { id: string }[] | null)?.[0]?.id
  if (!noticeId) return 'already sent'

  const { data: biz } = await db('businesses').select('name, email, subdomain, is_suspended').eq('id', n.businessId).maybeSingle()
  if (!biz || biz.is_suspended) return 'skipped (business suspended / missing)'

  const lapsed = new Date(n.expiresAt).getTime() <= Date.now()

  // Dashboard announcement (topbar) — disappears by itself at the deadline
  try {
    const author = await systemAuthorId()
    if (author) {
      const isGrace = n.kind === 'grace_started'
      const deadline = n.graceEndsAt ?? n.expiresAt
      const b = await BroadcastService.create({
        created_by: author,
        type: 'warning',
        title: isGrace ? 'Payment due — access locks soon' : 'Your subscription expires soon',
        body: isGrace
          ? `Your subscription ${lapsed ? 'has expired' : `expires ${fmtDate(n.expiresAt)}`}. Pay before ${fmtDate(deadline)} to keep access — Account → Subscriptions & Billing.`
          : `Your subscription expires on ${fmtDate(n.expiresAt)}. Renew in Account → Subscriptions & Billing to avoid interruption.`,
        target_scope: 'business',
        target_business_id: n.businessId,
        status: 'active',
        expires_at: isGrace ? deadline : n.expiresAt,
      } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      await db('subscription_notices').update({ broadcast_id: b.id }).eq('id', noticeId)
    }
  } catch (err) {
    console.error('[subscription-notices] announcement failed for', n.businessId, err)
  }

  // Email the owner
  if (!email) return 'announcement only'
  try {
    if (!biz.email) return 'announcement only (no email on file)'
    await EmailService.sendSubscriptionReminder({
      to: biz.email, businessName: biz.name, subdomain: biz.subdomain,
      kind: n.kind, expiresAt: n.expiresAt, graceEndsAt: n.graceEndsAt,
    })
    return 'sent'
  } catch (err) {
    console.error('[subscription-notices] email failed for', n.businessId, err)
    return 'announcement only (email failed)'
  }
}

export const SubscriptionNoticeService = {
  /** Stripe invoice.payment_failed → grace announcement (once per unpaid invoice). Never throws. */
  async notifyCardPaymentFailed(businessId: string, invoiceId: string): Promise<void> {
    try {
      const now = Date.now()
      await deliver({
        businessId,
        kind: 'grace_started',
        cycleKey: invoiceId, // retries of the same invoice → one notice
        expiresAt: new Date(now).toISOString(),
        graceEndsAt: new Date(now + GRACE_MS).toISOString(),
      }, { email: false })
    } catch (err) {
      console.warn('[subscription-notices] card notice skipped:', err instanceof Error ? err.message : err)
    }
  },

  /** Once-a-day cron: reminders for manual (non-Stripe) paid subscriptions. */
  async runDailyManualReminders() {
    const now = Date.now()
    const { data, error } = await db('subscriptions')
      .select('business_id, status, trial_ends_at, current_period_end, stripe_sub_id')
      .eq('status', 'active')
      .is('stripe_sub_id', null)
      .is('trial_ends_at', null)
      .gt('current_period_end', new Date(now - GRACE_MS).toISOString())
      .lte('current_period_end', new Date(now + 3 * DAY_MS).toISOString())
    if (error) throw error

    const results: Array<{ businessId: string; kind: NoticeKind; status: string }> = []
    for (const s of (data ?? []) as { business_id: string; current_period_end: string }[]) {
      const end = new Date(s.current_period_end).getTime()
      // Ends within the next day or ended in the last day → the 24h-grace notice
      // (sent before the lock even with a once-a-day run); 1–3 days out → early reminder
      const kind: NoticeKind = end - now <= DAY_MS ? 'grace_started' : 'expiring_3d'
      const status = await deliver({
        businessId: s.business_id,
        kind,
        cycleKey: new Date(end).toISOString(),
        expiresAt: new Date(end).toISOString(),
        graceEndsAt: kind === 'grace_started' ? new Date(end + GRACE_MS).toISOString() : null,
      })
      results.push({ businessId: s.business_id, kind, status })
    }
    return { checked: data?.length ?? 0, results }
  },

  /**
   * Payment received → archive this business's subscription announcements so
   * the "payment due" notice disappears straight away. Never throws.
   */
  async clearForBusiness(businessId: string): Promise<void> {
    try {
      const { data } = await db('subscription_notices').select('broadcast_id').eq('business_id', businessId).not('broadcast_id', 'is', null)
      const ids = ((data ?? []) as { broadcast_id: string }[]).map((r) => r.broadcast_id)
      if (ids.length === 0) return
      await db('system_broadcasts').update({ status: 'archived', updated_at: new Date().toISOString() }).in('id', ids).eq('status', 'active')
    } catch (err) {
      console.warn('[subscription-notices] clearForBusiness skipped:', err instanceof Error ? err.message : err)
    }
  },
}
