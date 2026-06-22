import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { InvoiceService } from '@/backend/services/invoice.service'
import { ok, created, notFound, serverError, badRequest } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { getPagination } from '@/backend/utils/pagination'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { PdfCacheService } from '@/backend/services/pdf-cache.service'

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_price: z.number().min(0),
})

const createSchema = z.object({
  branch_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
  reference_type: z.string().optional().nullable(),
  reference_id: z.string().uuid().nullable().optional(),
  items: z.array(lineItemSchema).min(1),
  subtotal: z.number().min(0),
  tax: z.number().min(0).default(0),
  total: z.number().min(0),
  notes: z.string().optional().nullable(),
})

const updateStatusSchema = z.object({
  status: z.enum(['issued', 'paid', 'unpaid', 'partial', 'refunded']),
})

const recordPaymentSchema = z.object({
  amount: z.number().positive(),
})

export const InvoiceController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    if (!branchId) return ok([], { page: 1, limit: 20, total: 0 })
    const { page, limit } = getPagination(searchParams)
    const customerId = searchParams.get('customer_id') ?? undefined
    try {
      const { data, count } = await InvoiceService.list(branchId, { page, limit, status: searchParams.get('status') ?? undefined, customer_id: customerId })
      return ok(data, { page, limit, total: count ?? 0 })
    } catch (err) {
      return serverError('Failed to fetch invoices', err)
    }
  },

  async getById(request: NextRequest, ctx: RequestContext, id: string) {
    const branchId = ctx.auth.branchId ?? null
    try {
      const invoice = await InvoiceService.getById(id, branchId)
      if (!invoice) return notFound('Invoice not found')
      return ok(invoice)
    } catch (err) {
      return serverError('Failed to fetch invoice', err)
    }
  },

  async create(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, createSchema)
    if (error) return error
    try {
      const invoice = await InvoiceService.create({ ...data, created_by: ctx.auth.userId })
      return created(invoice)
    } catch (err) {
      return serverError('Failed to create invoice', err)
    }
  },

  async updateStatus(request: NextRequest, ctx: RequestContext, id: string) {
    const branchId = ctx.auth.branchId ?? null
    const body = await request.json().catch(() => ({}))

    // Full update (edit invoice) — sent when body includes 'items' or 'subtotal'
    if (body.items !== undefined || body.subtotal !== undefined) {
      const fullSchema = z.object({
        customer_id: z.string().uuid().nullable().optional(),
        items: z.array(z.object({
          description: z.string().min(1),
          quantity: z.number().positive(),
          unit_price: z.number().min(0),
        })).optional(),
        subtotal: z.number().min(0).optional(),
        discount: z.number().min(0).optional(),
        tax: z.number().min(0).optional(),
        total: z.number().min(0).optional(),
        notes: z.string().nullable().optional(),
        status: z.enum(['issued', 'paid', 'unpaid', 'partial', 'refunded']).optional(),
      })
      const parsed = fullSchema.safeParse(body)
      if (!parsed.success) return badRequest('Invalid invoice update data')
      try {
        const invoice = await InvoiceService.update(id, branchId, parsed.data)
        PdfCacheService.invalidate('invoices', id).catch(() => {})
        return ok(invoice)
      } catch (err) {
        return serverError('Failed to update invoice', err)
      }
    }

    // Status-only update (existing behaviour)
    const parsed = updateStatusSchema.safeParse(body)
    if (!parsed.success) return badRequest('Invalid status')
    try {
      const invoice = await InvoiceService.updateStatus(id, branchId, parsed.data.status)
      PdfCacheService.invalidate('invoices', id).catch(() => {})
      return ok(invoice)
    } catch (err) {
      return serverError('Failed to update invoice status', err)
    }
  },

  async deleteInvoice(_request: NextRequest, ctx: RequestContext, id: string) {
    const branchId = ctx.auth.branchId ?? null
    try {
      await InvoiceService.delete(id, branchId)
      return ok({ deleted: true })
    } catch (err) {
      return serverError('Failed to delete invoice', err)
    }
  },

  async recordPayment(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, recordPaymentSchema)
    if (error) return error
    const branchId = ctx.auth.branchId ?? null
    try {
      const invoice = await InvoiceService.recordPayment(id, branchId, data.amount)
      // Amount paid changes — invalidate cached PDF.
      PdfCacheService.invalidate('invoices', id).catch(() => {})
      return ok(invoice)
    } catch (err) {
      return serverError('Failed to record payment', err)
    }
  },

  async getStatusSummary(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    try {
      const summary = await InvoiceService.getStatusSummary(branchId)
      return ok(summary)
    } catch (err) {
      return serverError('Failed to fetch invoice summary', err)
    }
  },

  async generatePdf(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const cachePath = PdfCacheService.cachePath('invoices', id)
      // Filename placeholder — real invoice_number fetched inside generatePdf if needed.
      const filename = `invoice-${id.slice(-8)}.pdf`

      // Single round-trip: createSignedUrl validates existence + produces URL.
      // Cache is invalidated via invalidate() whenever the invoice is mutated.
      const cachedUrl = await PdfCacheService.getSignedUrl(cachePath, filename)
      if (cachedUrl) return NextResponse.redirect(cachedUrl, { status: 302 })

      // Cache miss — generate full PDF (includes invoice_number in output)
      const buffer = await InvoiceService.generatePdf(id, ctx.businessId ?? undefined)
      const signedUrl = await PdfCacheService.store(cachePath, buffer, filename)

      if (signedUrl) return NextResponse.redirect(signedUrl, { status: 302 })

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    } catch (err) {
      return serverError('Failed to generate PDF', err)
    }
  },
}
