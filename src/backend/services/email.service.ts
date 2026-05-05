/**
 * Email service — sends templated and ad-hoc emails.
 * Uses nodemailer with SMTP.
 *
 * Priority:
 *   1. Per-business SMTP config (smtp_enabled = true) — stored in businesses table
 *   2. Global platform SMTP (env vars SMTP_HOST / SMTP_USER / SMTP_PASS)
 */
import nodemailer from 'nodemailer'      
import { resolve4 } from 'dns/promises'

// ── Transporter helpers ────────────────────────────────────────────────────────

interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

/**
 * Resolve a hostname to its first IPv4 address.
 * This bypasses the OS address-selection algorithm which may prefer unreachable
 * AAAA (IPv6) records. Falls back to the original hostname on any DNS error.
 */
async function resolveIPv4(hostname: string): Promise<string> {
  try {
    const addresses = await resolve4(hostname)
    return addresses[0] ?? hostname
  } catch {
    return hostname
  }
}

async function buildTransporter(cfg: SmtpConfig) {
  const host = await resolveIPv4(cfg.host)
  return nodemailer.createTransport({
    host,
    port:   cfg.port,
    secure: cfg.secure,
    auth:   { user: cfg.user, pass: cfg.pass },
    tls:    { rejectUnauthorized: false },
  })
}

/** Global platform transporter — used when no per-business SMTP is configured. */
async function getGlobalTransporter() {
  const hostname  = process.env.SMTP_HOST ?? 'smtp.ethereal.email'
  const port      = parseInt(process.env.SMTP_PORT ?? '587')
  const isSecure  = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === 'true'
    : port === 465

  const host = await resolveIPv4(hostname)

  return nodemailer.createTransport({
    host,
    port,
    secure: isSecure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: { rejectUnauthorized: false },
  })
}

function globalFromAddress(displayName?: string): string {
  const addr = process.env.SMTP_FROM ?? process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? ''
  return displayName ? `"${displayName}" <${addr}>` : addr
}

/**
 * Fetch per-business SMTP config from the database (lazy import to avoid circular deps
 * and to keep this service usable in edge/non-Supabase contexts).
 * Returns null if not enabled or not configured.
 */
async function getBusinessSmtpConfig(businessId: string): Promise<SmtpConfig | null> {
  try {
    const { adminSupabase } = await import('@/backend/config/supabase')
    const { data } = await (adminSupabase as any)
      .from('businesses')
      .select('smtp_enabled, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from')
      .eq('id', businessId)
      .single()

    if (
      !data ||
      !data.smtp_enabled ||
      !data.smtp_host ||
      !data.smtp_user ||
      !data.smtp_pass
    ) {
      return null
    }

    return {
      host:   data.smtp_host,
      port:   data.smtp_port ?? 587,
      secure: data.smtp_secure ?? false,
      user:   data.smtp_user,
      pass:   data.smtp_pass,
      from:   data.smtp_from ?? data.smtp_user,
    }
  } catch {
    return null
  }
}

// ── Public types ───────────────────────────────────────────────────────────────

export interface RepairStatusEmailPayload {
  customerEmail: string
  customerName: string
  jobNumber: string
  newStatus: string
  deviceInfo: string
  businessName: string
  note?: string
}

export interface TemplatedEmailPayload {
  to: string
  subject: string
  html: string
  fromName?: string
  /** When provided, the per-business SMTP config is used if enabled. */
  businessId?: string
}

const STATUS_LABELS: Record<string, string> = {
  received:       'Received',
  in_progress:    'In Progress',
  waiting_parts:  'Waiting for Parts',
  repaired:       'Repaired & Ready',
  unrepairable:   'Unfortunately Unrepairable',
  collected:      'Collected',
}

// ── EmailService ───────────────────────────────────────────────────────────────

export const EmailService = {
  async sendTemplated(payload: TemplatedEmailPayload) {
    const bizCfg = payload.businessId
      ? await getBusinessSmtpConfig(payload.businessId)
      : null

    if (bizCfg) {
      const from = payload.fromName
        ? `"${payload.fromName}" <${bizCfg.from}>`
        : bizCfg.from
      const transport = await buildTransporter(bizCfg)
      await transport.sendMail({
        from,
        to:      payload.to,
        subject: payload.subject,
        html:    payload.html,
      })
    } else {
      const from = payload.fromName
        ? `"${payload.fromName}" <${process.env.SMTP_FROM ?? process.env.EMAIL_FROM ?? process.env.SMTP_USER}>`
        : (process.env.SMTP_FROM ?? process.env.EMAIL_FROM ?? process.env.SMTP_USER)
      const transport = await getGlobalTransporter()
      await transport.sendMail({
        from,
        to:      payload.to,
        subject: payload.subject,
        html:    payload.html,
      })
    }
  },

  /**
   * Legacy method — kept for backward compatibility with existing repair controller.
   * New code should use NotificationEngine.fire() instead.
   */
  async sendRepairStatusUpdate(payload: RepairStatusEmailPayload) {
    const statusLabel = STATUS_LABELS[payload.newStatus] ?? payload.newStatus
    const transport = await getGlobalTransporter()
    await transport.sendMail({
      from:    `"${payload.businessName}" <${process.env.SMTP_FROM ?? process.env.EMAIL_FROM ?? process.env.SMTP_USER}>`,
      to:      payload.customerEmail,
      subject: `Repair Update: ${payload.jobNumber} — ${statusLabel}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2>Repair Status Update</h2>
          <p>Hi ${payload.customerName},</p>
          <p>Your repair job <strong>${payload.jobNumber}</strong> for <em>${payload.deviceInfo}</em> has been updated:</p>
          <div style="background:#f0f4ff;border-radius:8px;padding:16px;margin:16px 0">
            <strong style="font-size:18px">${statusLabel}</strong>
          </div>
          ${payload.note ? `<p><strong>Note:</strong> ${payload.note}</p>` : ''}
          <p>Thank you for choosing ${payload.businessName}.</p>
        </div>
      `,
    })
  },

  async sendWelcome(payload: {
    to: string; fullName: string; businessName: string
    subdomain: string; password: string; planName: string
  }) {
    const loginUrl = `https://${payload.subdomain}.repairbooking.co.uk/login`
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://repairbooking.co.uk'
    const transport = await getGlobalTransporter()
    await transport.sendMail({
      from: globalFromAddress('RepairBooking'),
      to: payload.to,
      subject: `Welcome to RepairBooking — Your account is ready`,
      html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8f9fa;font-family:Arial,sans-serif;">
        <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <div style="background:#008080;padding:40px 24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:28px;font-weight:800;letter-spacing:-0.5px;">RepairBooking</h1>
            <p style="color:rgba(255,255,255,0.85);margin:10px 0 0;font-size:15px;">Your shop is ready to go live</p>
          </div>
          <div style="padding:32px 24px;">
            <p style="color:#374151;font-size:16px;margin:0 0 8px;">Hi ${payload.fullName},</p>
            <p style="color:#6B7280;font-size:14px;line-height:1.6;margin:0 0 24px;">
              Your <strong>${payload.planName}</strong> account for <strong>${payload.businessName}</strong> has been activated. Here are your login credentials — keep them safe.
            </p>
            <div style="background:#e6f2f2;border:1px solid #008080;border-radius:12px;padding:24px;margin-bottom:24px;">
              <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#008080;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid rgba(0,128,128,0.1);padding-bottom:8px;">Your Login Details</p>
              
              <div style="margin-bottom:16px;">
                <p style="margin:0 0 4px;font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.025em;">Dashboard URL</p>
                <a href="${loginUrl}" style="display:block;color:#008080;font-weight:600;font-size:14px;text-decoration:none;word-break:break-all;">${loginUrl}</a>
              </div>

              <div style="margin-bottom:16px;">
                <p style="margin:0 0 4px;font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.025em;">Email</p>
                <p style="margin:0;font-size:15px;font-weight:600;color:#374151;word-break:break-all;">${payload.to}</p>
              </div>

              <div>
                <p style="margin:0 0 4px;font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.025em;">Password</p>
                <p style="margin:0;font-size:15px;font-weight:600;color:#374151;">${payload.password}</p>
              </div>
            </div>
            <p style="color:#6B7280;font-size:13px;margin:0 0 24px;">We recommend changing your password after your first login via <strong>Settings → Account</strong>.</p>
            <div style="text-align:center;margin-bottom:32px;">
              <a href="${loginUrl}" style="display:inline-block;background:#008080;color:#fff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;text-decoration:none;">Open Your Dashboard →</a>
            </div>
            <div style="border-top:1px solid #F3F4F6;padding-top:24px;">
              <p style="font-size:13px;font-weight:700;color:#374151;margin:0 0 12px;">What to do next:</p>
              <ol style="color:#6B7280;font-size:13px;line-height:1.8;padding-left:20px;margin:0;">
                <li>Log in and complete your business profile</li>
                <li>Add your staff and assign roles</li>
                <li>Set up your repair categories and services</li>
                <li>Add your inventory / products</li>
                <li>Start taking bookings and sales!</li>
              </ol>
            </div>
          </div>
          <div style="background:#F9FAFB;border-top:1px solid #F3F4F6;padding:20px 40px;text-align:center;">
            <p style="color:#9CA3AF;font-size:12px;margin:0;">© ${new Date().getFullYear()} The Social Nexus Ltd · <a href="${APP_URL}" style="color:#9CA3AF;">repairbooking.co.uk</a></p>
          </div>
        </div>
      </body></html>`,
    })
  },

  async sendPaymentFailed(payload: {
    to: string
    businessName: string
    subdomain: string
    amountDue: number
    currency: string
    attemptCount: number
    nextAttemptAt: string | null
  }) {
    const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'repairbooking.co.uk'
    const accountUrl = `https://${payload.subdomain}.${ROOT_DOMAIN}/account`
    const amount = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: payload.currency.toUpperCase(),
    }).format(payload.amountDue / 100)

    const nextAttemptLine = payload.nextAttemptAt
      ? `<p style="color:#6B7280;font-size:14px;margin:0 0 24px;">
           We will automatically retry the charge on
           <strong>${new Date(payload.nextAttemptAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.
           Update your payment method before then to avoid losing access.
         </p>`
      : `<p style="color:#6B7280;font-size:14px;margin:0 0 24px;">
           No further automatic retries will be made. Please update your payment method immediately to restore full access.
         </p>`

    const transport = await getGlobalTransporter()
    await transport.sendMail({
      from: globalFromAddress('RepairBooking'),
      to: payload.to,
      subject: `Action required: Payment failed for ${payload.businessName}`,
      html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8f9fa;font-family:Arial,sans-serif;">
        <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <div style="background:#ef4444;padding:32px 40px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:24px;font-weight:800;">RepairBooking</h1>
            <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px;">Payment failed — action required</p>
          </div>
          <div style="padding:40px;">
            <p style="color:#374151;font-size:16px;margin:0 0 8px;">Hi there,</p>
            <p style="color:#6B7280;font-size:14px;line-height:1.6;margin:0 0 24px;">
              We were unable to process the payment of <strong>${amount}</strong> for your
              <strong>${payload.businessName}</strong> subscription
              ${payload.attemptCount > 1 ? `(attempt ${payload.attemptCount})` : ''}.
              Your account is still active but access will be revoked if the payment cannot be collected.
            </p>
            ${nextAttemptLine}
            <div style="text-align:center;margin-bottom:32px;">
              <a href="${accountUrl}" style="display:inline-block;background:#008080;color:#fff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;text-decoration:none;">Update Payment Method →</a>
            </div>
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;">
              <p style="margin:0;font-size:13px;color:#991b1b;font-weight:600;">What happens if I don't act?</p>
              <ul style="margin:8px 0 0;padding-left:20px;color:#b91c1c;font-size:13px;line-height:1.8;">
                <li>Stripe will retry the payment automatically</li>
                <li>After all retries fail, your subscription will be cancelled</li>
                <li>All staff will lose access to the dashboard</li>
                <li>Your data is retained and will be restored when you resubscribe</li>
              </ul>
            </div>
          </div>
          <div style="background:#F9FAFB;border-top:1px solid #F3F4F6;padding:20px 40px;text-align:center;">
            <p style="color:#9CA3AF;font-size:12px;margin:0;">© ${new Date().getFullYear()} The Social Nexus Ltd · <a href="https://${ROOT_DOMAIN}" style="color:#9CA3AF;">repairbooking.co.uk</a></p>
          </div>
        </div>
      </body></html>`,
    })
  },

  async sendOtp(payload: { to: string; otp: string; expiresInMinutes: number }) {
    const APP_NAME = 'RepairBooking'
    const transport = await getGlobalTransporter()
    await transport.sendMail({
      from: globalFromAddress(APP_NAME),
      to: payload.to,
      subject: `${payload.otp} is your ${APP_NAME} verification code`,
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Your verification code</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td align="center" style="background:#008080;padding:28px 24px;">
              <h1 style="margin:0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">${APP_NAME}</h1>
              <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Email Verification</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td align="center" style="padding:36px 24px 28px;">
              <p style="margin:0 0 6px;font-size:16px;font-weight:600;color:#111827;">Verify your email address</p>
              <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.5;">Use the code below to complete your registration. It expires in <strong style="color:#374151;">${payload.expiresInMinutes} minutes</strong>.</p>

              <!-- OTP Box -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>
                  <td align="center" style="background:#f0fafa;border:2px solid #008080;border-radius:14px;padding:20px 32px;">
                    <span style="display:block;font-size:44px;font-weight:900;letter-spacing:14px;color:#008080;font-family:'Courier New',Courier,monospace;line-height:1;">${payload.otp}</span>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">Do not share this code with anyone.<br>RepairBooking will never ask for your code.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:16px 24px;">
              <p style="margin:0;font-size:12px;color:#d1d5db;">If you didn't request this, you can safely ignore this email.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    })
  },

  async sendEnterpriseEnquiry(payload: { businessName: string; email: string; fullName: string; phone?: string }) {
    const transport = await getGlobalTransporter()
    await transport.sendMail({
      from: globalFromAddress('RepairBooking'),
      to: process.env.SALES_EMAIL ?? 'connect@repairbooking.co.uk',
      subject: `New Enterprise enquiry — ${payload.businessName}`,
      html: `<p>New enterprise enquiry:</p><ul><li><b>Business:</b> ${payload.businessName}</li><li><b>Contact:</b> ${payload.fullName}</li><li><b>Email:</b> ${payload.email}</li><li><b>Phone:</b> ${payload.phone ?? '—'}</li></ul>`,
    })
    await transport.sendMail({
      from: globalFromAddress('RepairBooking'),
      to: payload.email,
      subject: `We've received your Enterprise enquiry — RepairBooking`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:40px auto;color:#374151;"><h2 style="color:#008080;">Thanks, ${payload.fullName}!</h2><p>We've received your Enterprise enquiry for <strong>${payload.businessName}</strong>.</p><p>One of our team will be in touch within <strong>1 business day</strong> to discuss your requirements.</p><p style="color:#6B7280;font-size:13px;">— The RepairBooking Team</p></div>`,
    })
  },

  async verifyConnection(): Promise<boolean> {
    try {
      const transport = await getGlobalTransporter()
      await transport.verify()
      return true
    } catch {
      return false
    }
  },

  async verifyBusinessConnection(cfg: {
    host: string
    port: number
    secure: boolean
    user: string
    pass: string
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const transport = await buildTransporter({ ...cfg, from: cfg.user })
      await transport.verify()
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Connection failed' }
    }
  },

  async sendTestEmail(cfg: {
    host: string; port: number; secure: boolean
    user: string; pass: string; from: string
  }, to: string, businessName: string): Promise<{ success: boolean; error?: string }> {
    try {
      const transport = await buildTransporter({ ...cfg })
      await transport.sendMail({
        from:    `"${businessName}" <${cfg.from}>`,
        to,
        subject: `✅ SMTP test from ${businessName} — RepairBooking`,
        html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:40px auto;color:#374151;">
          <h2 style="color:#008080;">Connection successful!</h2>
          <p>Your SMTP configuration for <strong>${businessName}</strong> is working correctly.</p>
          <p>Emails will now be sent to your customers from <strong>${cfg.from}</strong>.</p>
          <p style="color:#6B7280;font-size:13px;margin-top:24px;">— RepairBooking Platform</p>
        </div>`,
      })
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to send test email' }
    }
  },
}
