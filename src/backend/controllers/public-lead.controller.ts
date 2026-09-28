/**
 * PublicLeadController — unauthenticated endpoint that every lead-gen form on
 * the marketing site submits to (contact us, book a demo, newsletter, etc).
 * Each submission is stored in `leads` so the super admin can see, filter,
 * and action it from /superadmin/leads, and also fires a notification email
 * to the sales inbox. Rate limiting is applied at the route level.
 */

import { NextRequest } from 'next/server'
import { LeadService } from '@/backend/services/lead.service'
import { EmailService } from '@/backend/services/email.service'
import { ok, badRequest, serverError } from '@/backend/utils/api-response'
import { z } from 'zod'

const submitSchema = z.object({
  source: z.enum(['contact_us', 'demo_request', 'enterprise_contact', 'newsletter']),
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Valid email is required').max(200),
  phone: z.string().max(30).optional(),
  company: z.string().max(200).optional(),
  message: z.string().max(2000).optional(),
  page_url: z.string().max(500).optional(),
})

export const PublicLeadController = {
  /**
   * POST /api/public/leads
   */
  async submit(request: NextRequest) {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return badRequest('Invalid JSON body')
    }

    const parsed = submitSchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(', ')
      return badRequest(msg)
    }

    const { source, name, email, phone, company, message, page_url } = parsed.data

    try {
      const lead = await LeadService.create({
        source,
        name,
        email,
        phone: phone ?? null,
        company: company ?? null,
        message: message ?? null,
        page_url: page_url ?? null,
      })

      // Fire-and-forget — the lead is already saved even if the email fails.
      EmailService.sendLeadNotification({ source, name, email, phone, company, message }).catch((err) =>
        console.error('[PublicLeadController] Failed to send lead notification email', err)
      )

      return ok({ id: lead.id, message: "Thanks — we'll be in touch shortly." })
    } catch (err) {
      return serverError('Failed to submit form', err)
    }
  },
}
