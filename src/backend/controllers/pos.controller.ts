import { NextRequest, NextResponse } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { PosService } from '@/backend/services/pos.service'
import { CommissionService } from '@/backend/services/payroll.service'
import { ok, created, badRequest, notFound, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { getPagination } from '@/backend/utils/pagination'
import { z } from 'zod'
import { adminSupabase } from '@/backend/config/supabase'

// ── Shared receipt PDF generator (used by both on-demand and background warm) ──
async function buildReceiptBuffer(saleId: string, branchId: string | null, businessId: string | null) {
  const [sale, renderToBuffer, { SaleReceiptPdf }, { InvoiceSettingsService }, React] = await Promise.all([
    PosService.getSaleById(saleId, branchId),
    import('@react-pdf/renderer').then((m) => m.renderToBuffer),
    import('@/components/pdf/sale-receipt-pdf'),
    import('@/backend/services/invoice-settings.service'),
    import('react').then((m) => m.default),
  ])

  if (!sale) return null

  const s = sale as any

  const settings = businessId
    ? await InvoiceSettingsService.get(businessId, s.branch_id ?? null)
    : null

  const doc = React.createElement(SaleReceiptPdf, {
    saleId: s.id,
    date: new Date(s.created_at).toLocaleString('en-GB'),
    customerName: s.customer_name ?? '—',
    cashierName: s.cashier_name ?? '—',
    paymentMethod: s.payment_method ?? 'cash',
    paymentStatus: s.payment_status ?? 'paid',
    items: (s.sale_items ?? []).map((i: any) => ({
      name: i.name,
      quantity: i.quantity,
      unit_price: Number(i.unit_price),
      discount: Number(i.discount ?? 0),
      total: Number(i.total),
    })),
    subtotal: Number(s.subtotal ?? 0),
    discount: Number(s.discount ?? 0),
    tax: Number(s.tax ?? 0),
    total: Number(s.total ?? 0),
    isRefund: s.is_refund ?? false,
    refundReason: s.refund_reason ?? null,
    paymentSplits: s.payment_splits ?? null,
    notes: s.notes ?? null,
    branchName: s.branch_name ?? null,
    branchAddress: s.branch_address ?? null,
    branchPhone: s.branch_phone ?? null,
    branchEmail: s.branch_email ?? null,
    logoUrl: s.branch_logo_url ?? null,
    currency: s.business_currency ?? '£',
    settings,
  })

  return { buffer: await renderToBuffer(doc as any), createdAt: s.created_at }
}

const saleItemSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  variant_id: z.string().uuid().optional().nullable(),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unit_price: z.number().min(0),
  discount: z.number().min(0).default(0),
  total: z.number().min(0),
  is_service: z.boolean().default(false),
})

const paymentSplitSchema = z.object({
  method: z.enum(['cash', 'card', 'gift_card']),
  amount: z.number().positive(),
})

const createSaleSchema = z.object({
  branch_id: z.string().uuid(),
  cashier_id: z.string().uuid(),
  customer_id: z.string().uuid().optional().nullable(),
  subtotal: z.number().min(0),
  discount: z.number().min(0).default(0),
  tax: z.number().min(0).default(0),
  total: z.number().min(0),
  payment_method: z.enum(['cash', 'card', 'gift_card', 'split']),
  payment_splits: z.array(paymentSplitSchema).optional(),
  gift_card_id: z.string().uuid().optional().nullable(),
  gift_card_amount: z.number().min(0).optional(),
  notes: z.string().optional().nullable(),
  served_by_employee_id: z.string().uuid().optional().nullable(),
  // Cashier-entered commission for the served_by employee on this specific
  // sale (retail-store flow). Takes priority over any business-wide
  // commission rule or product-level commission rate.
  commission_amount: z.number().min(0).optional().nullable(),
  commission_type: z.enum(['flat', 'percentage']).optional().nullable(),
  items: z.array(saleItemSchema).min(1),
})

export const PosController = {
  async processSale(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, createSaleSchema)
    if (error) return error
    try {
      const saleId = await PosService.processSale(data)
      CommissionService.recordForSale(ctx.businessId, data.cashier_id, saleId, data.total, {
        servedByEmployeeId: data.served_by_employee_id ?? null,
        manualCommission: data.commission_amount
          ? { type: data.commission_type ?? 'flat', value: data.commission_amount }
          : null,
      }).catch(() => {})
      return created({ sale_id: saleId })
    } catch (err: any) {
      if (err?.code === 'P0001' && err?.message) return badRequest(err.message, 'STOCK_ERROR')
      return serverError('Failed to process sale', err)
    }
  },

  async listSales(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    const { page, limit } = getPagination(searchParams)
    try {
      const { data, count } = await PosService.getSales(branchId, {
        page,
        limit,
        from: searchParams.get('from') ?? undefined,
        to: searchParams.get('to') ?? undefined,
        status: searchParams.get('status') ?? undefined,
        search: searchParams.get('search') ?? undefined,
      })
      return ok(data, { page, limit, total: count ?? 0 })
    } catch (err) {
      return serverError('Failed to fetch sales', err)
    }
  },

  async getSalesStats(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    if (!branchId) return badRequest('branch_id required')
    try {
      const stats = await PosService.getSalesStats(branchId, {
        from: searchParams.get('from') ?? undefined,
        to: searchParams.get('to') ?? undefined,
        status: searchParams.get('status') ?? undefined,
      })
      return ok(stats)
    } catch (err) {
      return serverError('Failed to fetch sales stats', err)
    }
  },

  async getSaleById(request: NextRequest, ctx: RequestContext, id: string) {
    const branchId = ctx.auth.branchId ?? null
    try {
      const sale = await PosService.getSaleById(id, branchId)
      return ok(sale)
    } catch (err) {
      return serverError('Failed to fetch sale', err)
    }
  },

  async generateReceiptPdf(_request: NextRequest, ctx: RequestContext, id: string) {
    try {
      // Always regenerate — PDF content depends on invoice design settings which can
      // change at any time, so a cached copy would silently ignore setting updates.
      const result = await buildReceiptBuffer(id, ctx.auth.branchId ?? null, ctx.businessId)
      if (!result) return notFound()

      const filename = `receipt-${id.slice(-8)}.pdf`
      return new NextResponse(result.buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    } catch (err) {
      return serverError('Failed to generate receipt PDF', err)
    }
  },

  async deleteSale(_request: NextRequest, _ctx: RequestContext, id: string) {
    try {
      await PosService.deleteSale(id)
      return ok({ deleted: true })
    } catch (err: any) {
      if (err?.message?.includes('not found')) return notFound('Sale not found')
      if (err?.message?.includes('Cannot delete a refund')) return badRequest(err.message)
      return serverError('Failed to delete sale', err)
    }
  },

  async processRefund(request: NextRequest, ctx: RequestContext) {
    const refundItemSchema = z.object({
      product_id: z.string().uuid().optional().nullable(),
      variant_id: z.string().uuid().optional().nullable(),
      name: z.string().min(1),
      quantity: z.number().int().positive(),
      unit_price: z.number().min(0),
      total: z.number().min(0),
      is_service: z.boolean().default(false),
    })

    const refundSchema = z.object({
      original_sale_id: z.string().uuid(),
      branch_id: z.string().uuid(),
      cashier_id: z.string().uuid(),
      customer_id: z.string().uuid().optional().nullable(),
      subtotal: z.number().min(0),
      tax: z.number().min(0).default(0),
      total: z.number().min(0),
      payment_method: z.enum(['cash', 'card', 'gift_card', 'store_credit']),
      refund_reason: z.string().optional().nullable(),
      items: z.array(refundItemSchema).min(1),
    })

    const { data, error } = await validateBody(request, refundSchema)
    if (error) return error
    try {
      const refundId = await PosService.processRefund(data)
      return created({ refund_id: refundId })
    } catch (err) {
      return serverError('Failed to process refund', err)
    }
  },
}
