/**
 * Email service — sends templated and ad-hoc emails.
 * Uses nodemailer with SMTP by default.
 * In production, configure a transactional provider (Resend/SES) via business settings.
 */
import nodemailer from 'nodemailer'

function getTransporter() {
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
}

const STATUS_LABELS: Record<string, string> = {
  received:       'Received',
  in_progress:    'In Progress',
  waiting_parts:  'Waiting for Parts',
  repaired:       'Repaired & Ready',
  unrepairable:   'Unfortunately Unrepairable',
  collected:      'Collected',
}

export const EmailService = {
  /**
   * Send an email with pre-rendered subject and HTML body (used by NotificationEngine).
   */
  async sendTemplated(payload: TemplatedEmailPayload) {
    const from = payload.fromName
      ? `"${payload.fromName}" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`
      : process.env.SMTP_FROM ?? process.env.SMTP_USER

    await getTransporter().sendMail({
      from,
      to:      payload.to,
      subject: payload.subject,
      html:    payload.html,
    })
  },

  /**
   * Legacy method — kept for backward compatibility with existing repair controller.
   * New code should use NotificationEngine.fire() instead.
   */
  async sendRepairStatusUpdate(payload: RepairStatusEmailPayload) {
    const statusLabel = STATUS_LABELS[payload.newStatus] ?? payload.newStatus

    await getTransporter().sendMail({
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

  /**
   * Verify SMTP connection is working (used for test notifications).
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await getTransporter().verify()
      return true
    } catch {
      return false
    }
  },
}
