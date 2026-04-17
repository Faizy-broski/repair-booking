import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { InvoiceSettingsService } from '@/backend/services/invoice-settings.service'
import { ok, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const socialLinksSchema = z.object({
  website:   z.string().url().optional().or(z.literal('')),
  facebook:  z.string().url().optional().or(z.literal('')),
  instagram: z.string().url().optional().or(z.literal('')),
  twitter:   z.string().url().optional().or(z.literal('')),
  whatsapp:  z.string().optional().or(z.literal('')),
  tiktok:    z.string().url().optional().or(z.literal('')),
}).optional()

const schema = z.object({
  // Scope
  branch_id: z.string().uuid().nullable().optional(),

  // Page
  paper_size:  z.enum(['A4','A5','Letter','Receipt80','Receipt58']).optional(),
  orientation: z.enum(['portrait','landscape']).optional(),

  // Branding
  logo_url:        z.string().url().nullable().optional().or(z.literal('')),
  primary_color:   z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  secondary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  text_color:      z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  font_family:     z.string().optional(),

  // Header toggles
  show_logo:          z.boolean().optional(),
  show_business_name: z.boolean().optional(),
  show_branch_name:   z.boolean().optional(),
  show_address:       z.boolean().optional(),
  show_phone:         z.boolean().optional(),
  show_email:         z.boolean().optional(),

  // Footer
  footer_line_1:     z.string().nullable().optional(),
  footer_line_2:     z.string().nullable().optional(),
  footer_line_3:     z.string().nullable().optional(),
  thank_you_message: z.string().nullable().optional(),
  policy_text:       z.string().nullable().optional(),

  // Social links
  social_links: socialLinksSchema,

  // Options
  show_tax_breakdown:    z.boolean().optional(),
  show_payment_method:   z.boolean().optional(),
  show_unpaid_watermark: z.boolean().optional(),
})

export const InvoiceSettingsController = {
  async get(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    try {
      const settings = await InvoiceSettingsService.get(ctx.businessId!, branchId)
      return ok(settings)
    } catch (err) {
      return serverError('Failed to fetch invoice settings', err)
    }
  },

  async upsert(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, schema)
    if (error) return error

    const { branch_id, ...rest } = data
    // branch_manager can only save for their own branch; owner can save business default (null)
    const targetBranch = branch_id !== undefined ? branch_id : (ctx.auth.branchId ?? null)

    try {
      const settings = await InvoiceSettingsService.upsert(ctx.businessId!, targetBranch, rest as any)
      return ok(settings)
    } catch (err) {
      return serverError('Failed to save invoice settings', err)
    }
  },
}
