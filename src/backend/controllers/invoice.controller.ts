import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { InvoiceService } from '@/backend/services/invoice.service'
import { ok, created, notFound, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { getPagination } from '@/backend/utils/pagination'
import { NextResponse } from 'next/server'
import { z } from 'zod'

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
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'cancelled', 'unpaid', 'partial', 'refunded']),
})

const recordPaymentSchema = z.object({
  amount: z.number().positive(),
})

export const InvoiceController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? ''
    const { page, limit } = getPagination(searchParams)
    try {
      const { data, count } = await InvoiceService.list(branchId, { page, limit, status: searchParams.get('status') ?? undefined })
      return ok(data, { page, limit, total: count ?? 0 })
    } catch (err) {
      return serverError('Failed to fetch invoices', err)
    }
  },

  async getById(request: NextRequest, ctx: RequestContext, id: string) {
    const branchId = ctx.auth.branchId ?? ''
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
    const { data, error } = await validateBody(request, updateStatusSchema)
    if (error) return error
    const branchId = ctx.auth.branchId ?? ''
    try {
      const invoice = await InvoiceService.updateStatus(id, branchId, data.status)
      return ok(invoice)
    } catch (err) {
      return serverError('Failed to update invoice status', err)
    }
  },

  async recordPayment(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, recordPaymentSchema)
    if (error) return error
    const branchId = ctx.auth.branchId ?? ''
    try {
      const invoice = await InvoiceService.recordPayment(id, branchId, data.amount)
      return ok(invoice)
    } catch (err) {
      return serverError('Failed to record payment', err)
    }
  },

  async getStatusSummary(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? ''
    try {
      const summary = await InvoiceService.getStatusSummary(branchId)
      return ok(summary)
    } catch (err) {
      return serverError('Failed to fetch invoice summary', err)
    }
  },

  async generatePdf(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const buffer = await InvoiceService.generatePdf(id)
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="invoice-${id}.pdf"`,
        },
      })
    } catch (err) {
      return serverError('Failed to generate PDF', err)
    }
  },
}
