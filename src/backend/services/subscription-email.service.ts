import { EmailService } from '@/backend/services/email.service'
import { adminSupabase } from '@/backend/config/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SubscriptionEmailPayload {
  businessId: string
  planName: string
  planType: string
  billingCycle: 'monthly' | 'yearly' | null
  priceMonthly: number
  priceYearly: number | null
  features: string[]
  periodEnd: string | null   // ISO string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function formatPrice(monthly: number, yearly: number | null, cycle: string | null): string {
  if (monthly === 0) return 'Free'
  if (cycle === 'yearly' && yearly) return `£${yearly.toFixed(2)} / year`
  return `£${monthly.toFixed(2)} / month`
}

// ── Business-owner confirmation email ─────────────────────────────────────────

function buildOwnerEmailHtml(payload: SubscriptionEmailPayload, businessName: string): string {
  const price    = formatPrice(payload.priceMonthly, payload.priceYearly, payload.billingCycle)
  const nextDate = formatDate(payload.periodEnd)
  const isYearly = payload.billingCycle === 'yearly'
  const isFree   = payload.planType === 'free' || payload.priceMonthly === 0

  const featuresHtml = payload.features.length
    ? payload.features.map(f => `
        <tr>
          <td style="padding:6px 0;display:flex;align-items:center;gap:10px;">
            <span style="display:inline-block;width:20px;height:20px;background:#d1fae5;border-radius:50%;text-align:center;line-height:20px;font-size:12px;color:#059669;flex-shrink:0;">✓</span>
            <span style="color:#374151;font-size:14px;">${f}</span>
          </td>
        </tr>`).join('')
    : ''

  const savingsBadge = isYearly && payload.priceYearly && payload.priceMonthly
    ? (() => {
        const saving = (payload.priceMonthly * 12 - payload.priceYearly).toFixed(2)
        return `
          <div style="display:inline-block;background:#fef3c7;border:1px solid #fcd34d;color:#92400e;
                      font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;margin-top:8px;">
            💰 You're saving £${saving} by paying yearly
          </div>`
      })()
    : ''

  return `
    <!-- Success badge -->
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-flex;align-items:center;justify-content:center;
                  width:64px;height:64px;background:#d1fae5;border-radius:50%;margin-bottom:16px;">
        <span style="font-size:28px;">✓</span>
      </div>
      <h2 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#111827;">
        ${isFree ? 'Welcome to RepairBooking!' : 'Subscription Confirmed!'}
      </h2>
      <p style="margin:0;color:#6b7280;font-size:14px;">
        Hi <strong>${businessName}</strong>, your <strong>${payload.planName} Plan</strong> is now active.
      </p>
    </div>

    <!-- Plan card -->
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:24px;margin-bottom:24px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
        <div>
          <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;
                    color:#059669;font-weight:600;">Your Plan</p>
          <p style="margin:0;font-size:24px;font-weight:700;color:#111827;">${payload.planName}</p>
          ${savingsBadge}
        </div>
        <div style="text-align:right;">
          <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;
                    color:#6b7280;font-weight:600;">Price</p>
          <p style="margin:0;font-size:22px;font-weight:700;color:#059669;">${price}</p>
          ${!isFree ? `<p style="margin:4px 0 0;font-size:12px;color:#6b7280;">
            Next billing: ${nextDate}
          </p>` : ''}
        </div>
      </div>
    </div>

    ${featuresHtml ? `
    <!-- Features -->
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#374151;
                text-transform:uppercase;letter-spacing:0.05em;">What's included</p>
      <table role="presentation" width="100%" style="border-collapse:collapse;">
        ${featuresHtml}
      </table>
    </div>` : ''}

    <!-- Divider -->
    <div style="border-top:1px solid #e5e7eb;margin:24px 0;"></div>

    <!-- Support note -->
    <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;line-height:1.6;">
      Questions? Reply to this email or contact us at
      <a href="mailto:${process.env.SMTP_FROM ?? 'connect@repairbooking.co.uk'}"
         style="color:#0f766e;text-decoration:none;">
        ${process.env.SMTP_FROM ?? 'connect@repairbooking.co.uk'}
      </a>
    </p>
  `
}

// ── Super-admin notification email ─────────────────────────────────────────────

function buildAdminEmailHtml(
  businessName: string,
  businessEmail: string,
  subdomain: string,
  planName: string,
  billingCycle: string | null,
  price: string,
  createdAt: string,
): string {
  return `
    <h2 style="margin:0 0 20px;font-size:18px;font-weight:700;color:#111827;">
      🎉 New Subscriber
    </h2>

    <table role="presentation" width="100%"
           style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      ${[
        ['Business',      businessName],
        ['Email',         businessEmail],
        ['Subdomain',     `${subdomain}.repairbooking.co.uk`],
        ['Plan',          planName],
        ['Billing cycle', billingCycle ?? '—'],
        ['Price',         price],
        ['Subscribed at', createdAt],
      ].map(([label, value], i) => `
        <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'};">
          <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#6b7280;
                     white-space:nowrap;border-bottom:1px solid #f3f4f6;">${label}</td>
          <td style="padding:10px 16px;font-size:13px;color:#111827;
                     border-bottom:1px solid #f3f4f6;">${value}</td>
        </tr>`).join('')}
    </table>

  `
}

// ── Public API ─────────────────────────────────────────────────────────────────

export const SubscriptionEmailService = {
  /**
   * Sends a branded confirmation email to the business owner and a notification
   * to the super-admin. Both are fire-and-forget — errors are logged, never thrown.
   */
  async sendNewSubscriptionEmails(
    businessId: string,
    planId: string,
    periodEnd: string | null,
  ): Promise<void> {
    try {
      // Fetch business + plan in parallel
      const [bizResult, planResult] = await Promise.all([
        adminSupabase
          .from('businesses')
          .select('name, email, subdomain, logo_url, created_at')
          .eq('id', businessId)
          .single(),
        (adminSupabase as any)
          .from('plans')
          .select('name, plan_type, price_monthly, price_yearly, features')
          .eq('id', planId)
          .single(),
      ])

      const biz  = bizResult.data
      const plan = planResult.data

      if (!biz || !plan) {
        console.warn('[SubscriptionEmailService] Could not fetch business or plan for email:', { businessId, planId })
        return
      }

      // Fetch primary color from invoice_settings if available (non-fatal)
      const { data: invSettings } = await adminSupabase
        .from('invoice_settings')
        .select('primary_color, logo_url')
        .eq('business_id', businessId)
        .is('branch_id', null)
        .maybeSingle()

      const primaryColor = invSettings?.primary_color ?? '#0f766e'
      const logoUrl      = invSettings?.logo_url ?? biz.logo_url ?? null

      // Normalise features array (plans store features as JSONB — may be strings or objects)
      const rawFeatures: unknown[] = Array.isArray(plan.features) ? plan.features : []
      const features: string[] = rawFeatures
        .map(f => (typeof f === 'string' ? f : (f as any)?.name ?? (f as any)?.label ?? String(f)))
        .filter(Boolean)
        .slice(0, 10) // cap at 10 to keep email concise

      // Detect billing cycle from period dates (monthly ≈ 31 days, yearly ≈ 365 days)
      let billingCycle: 'monthly' | 'yearly' | null = null
      if (periodEnd) {
        const days = (new Date(periodEnd).getTime() - Date.now()) / 86_400_000
        billingCycle = days > 60 ? 'yearly' : 'monthly'
      }

      const payload: SubscriptionEmailPayload = {
        businessId,
        planName:     plan.name,
        planType:     plan.plan_type ?? 'paid',
        billingCycle,
        priceMonthly: Number(plan.price_monthly ?? 0),
        priceYearly:  plan.price_yearly ? Number(plan.price_yearly) : null,
        features,
        periodEnd,
      }

      // ── 1. Business-owner confirmation ──────────────────────────────────────
      await EmailService.sendTemplated({
        to:           biz.email,
        subject:      `Your ${plan.name} Plan is now active — RepairBooking`,
        html:         buildOwnerEmailHtml(payload, biz.name),
        fromName:     'RepairBooking',
        logoUrl,
        storeEmail:   process.env.SMTP_FROM ?? 'connect@repairbooking.co.uk',
        primaryColor,
      }).catch(err => console.error('[SubscriptionEmailService] Owner email failed:', err))

      // ── 2. Super-admin notification ─────────────────────────────────────────
      const adminEmail = process.env.SUPER_ADMIN_EMAIL
      if (adminEmail) {
        const price = formatPrice(payload.priceMonthly, payload.priceYearly, billingCycle)
        await EmailService.sendTemplated({
          to:           adminEmail,
          subject:      `[New Subscriber] ${biz.name} — ${plan.name} Plan`,
          html:         buildAdminEmailHtml(
            biz.name,
            biz.email,
            biz.subdomain,
            plan.name,
            billingCycle,
            price,
            new Date(biz.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' }),
          ),
          fromName:     'RepairBooking Alerts',
          primaryColor: '#1e293b',
        }).catch(err => console.error('[SubscriptionEmailService] Admin email failed:', err))
      }
    } catch (err) {
      // Never throw — email failure must not block the subscription confirmation response
      console.error('[SubscriptionEmailService] Unexpected error:', err)
    }
  },
}
