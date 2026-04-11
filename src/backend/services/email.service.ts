/**
 * Email service — sends templated and ad-hoc emails.
 * Uses nodemailer with SMTP.
 *
 * Priority:
 *   1. Per-business SMTP config (smtp_enabled = true) — stored in businesses table
 *   2. Global platform SMTP (env vars SMTP_HOST / SMTP_USER / SMTP_PASS)
 */
import nodemailer from 'nodemailer'

// ── Transporter helpers ────────────────────────────────────────────────────────

interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

function buildTransporter(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host:   cfg.host,
    port:   cfg.port,
    secure: cfg.secure,
    auth:   { user: cfg.user, pass: cfg.pass },
  })
}

/** Global platform transporter — used when no per-business SMTP is configured. */
function getGlobalTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST ?? 'smtp.ethereal.email',
    port:   parseInt(process.env.SMTP_PORT ?? '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

function globalFromAddress(displayName?: string): string {
  const addr = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? ''
  return displayName ? `"${displayName}" <${addr}>` : addr
}

/**
 * Fetch per-business SMTP config from the database (lazy import to avoid circular deps
 * and to keep this service usable in edge/non-Supabase contexts).
 * Returns null if not enabled or not configured.
 */
async function getBusinessSmtpConfig(businessId: string): Promise<SmtpConfig | null> {
  try {
    // Dynamic import so this service can still be imported without Supabase env vars
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
  /**
   * Send an email with pre-rendered subject and HTML body (used by NotificationEngine).
   * If `businessId` is supplied and that business has SMTP enabled, uses their credentials.
   */
  async sendTemplated(payload: TemplatedEmailPayload) {
    const bizCfg = payload.businessId
      ? await getBusinessSmtpConfig(payload.businessId)
      : null

    if (bizCfg) {
      const from = payload.fromName
        ? `"${payload.fromName}" <${bizCfg.from}>`
        : bizCfg.from
      await buildTransporter(bizCfg).sendMail({
        from,
        to:      payload.to,
        subject: payload.subject,
        html:    payload.html,
      })
    } else {
      const from = payload.fromName
        ? `"${payload.fromName}" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`
        : (process.env.SMTP_FROM ?? process.env.SMTP_USER)
      await getGlobalTransporter().sendMail({
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

    await getGlobalTransporter().sendMail({
      from:    `"${payload.businessName}" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
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

    await getGlobalTransporter().sendMail({
      from: `"RepairBooking" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
      to: payload.to,
      subject: `Welcome to RepairBooking — Your account is ready`,
      html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8f9fa;font-family:Arial,sans-serif;">
        <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <div style="background:#3BB3C3;padding:32px 40px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:24px;font-weight:800;">RepairBooking</h1>
            <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Your shop is ready to go live</p>
          </div>
          <div style="padding:40px;">
            <p style="color:#374151;font-size:16px;margin:0 0 8px;">Hi ${payload.fullName},</p>
            <p style="color:#6B7280;font-size:14px;line-height:1.6;margin:0 0 24px;">
              Your <strong>${payload.planName}</strong> account for <strong>${payload.businessName}</strong> has been activated. Here are your login credentials — keep them safe.
            </p>
            <div style="background:#f3fffe;border:1px solid #3BB3C3;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
              <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#3BB3C3;text-transform:uppercase;letter-spacing:0.05em;">Your Login Details</p>
              <table style="width:100%;font-size:14px;color:#374151;border-collapse:collapse;">
                <tr><td style="padding:4px 0;color:#6B7280;width:120px;">Dashboard URL</td><td><a href="${loginUrl}" style="color:#3BB3C3;font-weight:600;">${loginUrl}</a></td></tr>
                <tr><td style="padding:4px 0;color:#6B7280;">Email</td><td><strong>${payload.to}</strong></td></tr>
                <tr><td style="padding:4px 0;color:#6B7280;">Password</td><td><strong>${payload.password}</strong></td></tr>
              </table>
            </div>
            <p style="color:#6B7280;font-size:13px;margin:0 0 24px;">We recommend changing your password after your first login via <strong>Settings → Account</strong>.</p>
            <div style="text-align:center;margin-bottom:32px;">
              <a href="${loginUrl}" style="display:inline-block;background:#3BB3C3;color:#fff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;text-decoration:none;">Open Your Dashboard →</a>
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

  async sendEnterpriseEnquiry(payload: { businessName: string; email: string; fullName: string; phone?: string }) {
    const t = getGlobalTransporter()
    await t.sendMail({
      from: `"RepairBooking" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
      to: process.env.SALES_EMAIL ?? 'sales@repairbooking.co.uk',
      subject: `New Enterprise enquiry — ${payload.businessName}`,
      html: `<p>New enterprise enquiry:</p><ul><li><b>Business:</b> ${payload.businessName}</li><li><b>Contact:</b> ${payload.fullName}</li><li><b>Email:</b> ${payload.email}</li><li><b>Phone:</b> ${payload.phone ?? '—'}</li></ul>`,
    })
    await t.sendMail({
      from: `"RepairBooking" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
      to: payload.email,
      subject: `We've received your Enterprise enquiry — RepairBooking`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:40px auto;color:#374151;"><h2 style="color:#3BB3C3;">Thanks, ${payload.fullName}!</h2><p>We've received your Enterprise enquiry for <strong>${payload.businessName}</strong>.</p><p>One of our team will be in touch within <strong>1 business day</strong> to discuss your requirements.</p><p style="color:#6B7280;font-size:13px;">— The RepairBooking Team</p></div>`,
    })
  },

  /**
   * Verify SMTP connection — checks global platform config.
   * For per-business config, use verifyBusinessConnection().
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await getGlobalTransporter().verify()
      return true
    } catch {
      return false
    }
  },

  /**
   * Verify a per-business SMTP config by building a transporter from the supplied values.
   * Used by the "Test Connection" feature in settings.
   */
  async verifyBusinessConnection(cfg: {
    host: string
    port: number
    secure: boolean
    user: string
    pass: string
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const transport = nodemailer.createTransport({
        host:   cfg.host,
        port:   cfg.port,
        secure: cfg.secure,
        auth:   { user: cfg.user, pass: cfg.pass },
      })
      await transport.verify()
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Connection failed' }
    }
  },

  /**
   * Send a test email using per-business SMTP credentials.
   * Credentials are passed directly (not yet saved) so the owner can test before saving.
   */
  async sendTestEmail(cfg: {
    host: string; port: number; secure: boolean
    user: string; pass: string; from: string
  }, to: string, businessName: string): Promise<{ success: boolean; error?: string }> {
    try {
      const transport = buildTransporter({ ...cfg })
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
