import { z } from 'zod'
import { withMiddleware } from '@/backend/middleware'
import { RepairService } from '@/backend/services/repair.service'
import { EmailService } from '@/backend/services/email.service'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, badRequest, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'

const sendEmailSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  html: z.string().min(1, 'Email body is required'),
})

export const POST = withMiddleware(
  async (req, ctx, { params }) => {
    const { id } = await params
    const { data, error } = await validateBody(req, sendEmailSchema)
    if (error) return error

    try {
      const branchId = ctx.auth.branchId ?? null
      const [repair, { data: business }, { data: invoiceSettings }] = await Promise.all([
        RepairService.getById(id, branchId ?? undefined),
        (adminSupabase as any).from('businesses').select('name, phone, email, reply_to_email, logo_url').eq('id', ctx.businessId).single(),
        (adminSupabase as any).from('invoice_settings').select('primary_color, logo_url').eq('business_id', ctx.businessId).single(),
      ])

      if (!repair) return serverError('Repair not found')
      if (!repair.customers?.email) return badRequest('No customer email on file')

      await EmailService.sendTemplated({
        to: repair.customers.email,
        subject: data.subject,
        html: data.html,
        fromName: business?.name ?? undefined,
        businessId: ctx.businessId,
        logoUrl: invoiceSettings?.logo_url ?? business?.logo_url ?? null,
        storePhone: business?.phone ?? undefined,
        storeEmail: business?.email ?? undefined,
        replyTo: business?.reply_to_email ?? undefined,
        primaryColor: invoiceSettings?.primary_color ?? undefined,
      })

      return ok({ sent: true })
    } catch (err) {
      return serverError('Failed to send email', err)
    }
  },
  { requiredRole: 'staff' }
)
