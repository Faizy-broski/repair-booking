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
async function buildReceiptBuffer(saleId: string, branchId: string | null, businessId: string | null, paymentId?: string) {
  const [sale, renderToBuffer, { SaleReceiptPdf }, { InvoiceSettingsService }, { getCurrencySymbol }, React] = await Promise.all([
    PosService.getSaleById(saleId, branchId),
    import('@react-pdf/renderer').then((m) => m.renderToBuffer),
    import('@/components/pdf/sale-receipt-pdf'),
    import('@/backend/services/invoice-settings.service'),
    import('@/lib/utils'),
    import('react').then((m) => m.default),
  ])

  if (!sale) return null

  const s = sale as any

  // For a single-payment receipt, resolve this payment's own amount and the
  // running total paid through (and including) it — not the sale's all-time total.
  let depositLabelAmount: number | undefined
  let amountPaidOverride: number | undefined
  if (paymentId) {
    const { data: payments } = await adminSupabase
      .from('sale_payments')
      .select('id, amount, created_at')
      .eq('sale_id', saleId)
      .order('created_at', { ascending: true })
    const ordered = (payments ?? []) as { id: string; amount: number; created_at: string }[]
    const idx = ordered.findIndex((p) => p.id === paymentId)
    if (idx !== -1) {
      depositLabelAmount = Number(ordered[idx].amount)
      amountPaidOverride = ordered.slice(0, idx + 1).reduce((sum, p) => sum + Number(p.amount), 0)
    }
  }

  const [settings, businessRow] = await Promise.all([
    businessId ? InvoiceSettingsService.get(businessId, s.branch_id ?? null) : Promise.resolve(null),
    businessId
      ? adminSupabase.from('businesses').select('name, currency').eq('id', businessId).single().then(r => r.data)
      : Promise.resolve(null),
  ])

  // For exchange sales, fetch the returned items from the associated refund record
  let exchangeReturnedItems: { name: string; quantity: number; unit_price: number; discount: number; total: number }[] = []
  let exchangeReturnedTotal = 0
  if (s.is_exchange && s.exchange_original_id) {
    const { data: refundRecord } = await adminSupabase
      .from('sales')
      .select('total, sale_items(name, quantity, unit_price, total)')
      .eq('original_sale_id', s.exchange_original_id)
      .eq('is_refund', true)
      .eq('refund_reason', 'Product exchange')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (refundRecord) {
      exchangeReturnedItems = ((refundRecord as any).sale_items ?? []).map((i: any) => ({
        name: i.name,
        quantity: Math.abs(i.quantity),
        unit_price: Number(i.unit_price),
        discount: 0,
        total: Math.abs(Number(i.total)),
      }))
      exchangeReturnedTotal = Math.abs(Number((refundRecord as any).total))
    }
  }

  // Gross subtotal / total discount (not the sale's stored net subtotal/
  // order-level discount) so the summary reconciles with each line's own
  // UNIT/DISC — a sale-priced line's frozen original_unit_price means its
  // real discount isn't captured by the stale sale.discount total alone.
  let grossSubtotal = 0
  let totalDiscount = 0
  for (const i of (s.sale_items ?? []) as any[]) {
    const unitPrice = Number(i.unit_price)
    const discount = Number(i.discount ?? 0)
    const original = i.original_unit_price != null ? Number(i.original_unit_price) : null
    const hasOriginal = original != null && original > unitPrice
    grossSubtotal += (hasOriginal ? original! : unitPrice) * i.quantity
    // Additive — a line can carry both a frozen sale-price discount AND a
    // manual per-line discount; dropping either one understates the total.
    totalDiscount += (hasOriginal ? (original! - unitPrice + discount) : discount) * i.quantity
  }
  totalDiscount += Number(s.discount ?? 0)

  const doc = React.createElement(SaleReceiptPdf, {
    saleId: s.id,
    date: new Date(s.created_at).toLocaleString('en-GB'),
    customerName: s.customers
      ? [s.customers.first_name, s.customers.last_name].filter(Boolean).join(' ')
      : (s.customer_name ?? '—'),
    cashierName: s.profiles?.full_name ?? s.cashier_name ?? '—',
    paymentMethod: s.payment_method ?? 'cash',
    paymentStatus: s.payment_status ?? 'paid',
    items: (s.sale_items ?? []).map((i: any) => ({
      name: i.name,
      quantity: i.quantity,
      unit_price: Number(i.unit_price),
      discount: Number(i.discount ?? 0),
      total: Number(i.total),
      original_unit_price: i.original_unit_price != null ? Number(i.original_unit_price) : undefined,
    })),
    subtotal: grossSubtotal,
    discount: totalDiscount,
    tax: Number(s.tax ?? 0),
    total: Number(s.total ?? 0),
    amountPaid: amountPaidOverride ?? Number(s.amount_paid ?? 0),
    depositLabelAmount,
    isRefund: s.is_refund ?? false,
    isExchange: s.is_exchange ?? false,
    exchangeReturnedItems,
    exchangeReturnedTotal,
    refundReason: s.refund_reason ?? null,
    paymentSplits: s.payment_splits ?? null,
    notes: s.notes
      ? s.notes.replace(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,
          (uuid: string) => `#${uuid.slice(-8).toUpperCase()}`)
      : null,
    businessName: businessRow?.name ?? null,
    branchName: s.branches?.name ?? s.branch_name ?? null,
    branchAddress: s.branches?.address ?? s.branch_address ?? null,
    branchPhone: s.branches?.phone ?? s.branch_phone ?? null,
    branchEmail: s.branches?.email ?? s.branch_email ?? null,
    logoUrl: s.branches?.logo_url ?? s.branch_logo_url ?? null,
    currency: businessRow?.currency ?? undefined,
    settings: settings ?? undefined,
  })

  return { buffer: await renderToBuffer(doc as any), createdAt: s.created_at }
}

const saleItemSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  repair_id: z.string().uuid().optional().nullable(),
  variant_id: z.string().uuid().optional().nullable(),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unit_price: z.number().min(0),
  discount: z.number().min(0).default(0),
  total: z.number().min(0),
  is_service: z.boolean().default(false),
  // Quantity-scoped discount picker (retail-store template) — true when this
  // line was added at the discount price, so process_sale knows to consume
  // from the product's active discount allocation instead of/alongside the
  // normal reservation check.
  is_discount: z.boolean().optional().default(false),
})

const paymentSplitSchema = z.object({
  method: z.enum(['cash', 'card', 'gift_card', 'ebay', 'deliveroo', 'website']),
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
  payment_method: z.enum(['cash', 'card', 'gift_card', 'split', 'on_account', 'ebay', 'deliveroo', 'website', 'store_credit', 'loyalty_points']),
  amount_paid: z.number().min(0).default(0),
  payment_splits: z.array(paymentSplitSchema).optional(),
  gift_card_id: z.string().uuid().optional().nullable(),
  gift_card_amount: z.number().min(0).optional(),
  store_credit_amount: z.number().min(0).optional(),
  loyalty_points_used: z.number().int().min(0).optional(),
  notes: z.string().optional().nullable(),
  employee_id: z.string().uuid().optional().nullable(),
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
      const { saleId, invoiceNumber } = await PosService.processSale(data)
      CommissionService.recordForSale(ctx.businessId, data.cashier_id, saleId, data.total, {
        servedByEmployeeId: data.served_by_employee_id ?? null,
        manualCommission: data.commission_amount
          ? { type: data.commission_type ?? 'flat', value: data.commission_amount }
          : null,
      }).catch(() => {})
      return created({ sale_id: saleId, invoice_number: invoiceNumber })
    } catch (err: any) {
      if (err?.code === 'P0001' && err?.message) return badRequest(err.message, 'STOCK_ERROR')
      return serverError('Failed to process sale', err)
    }
  },

  async listSales(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    if (!branchId) return badRequest('branch_id required')
    const { page, limit } = getPagination(searchParams)
    try {
      const { data, count } = await PosService.getSales(branchId, {
        page,
        limit,
        from: searchParams.get('from') ?? undefined,
        to: searchParams.get('to') ?? undefined,
        status: searchParams.get('status') ?? undefined,
        search: searchParams.get('search') ?? undefined,
        paymentMethod: searchParams.get('payment_method') ?? undefined,
        outstandingOnly: searchParams.get('outstanding_only') === 'true',
        employeeId: searchParams.get('employee_id') ?? undefined,
        employeePurchasesOnly: searchParams.get('employee_purchases') === 'true',
      })
      return ok(data, { page, limit, total: count ?? 0 })
    } catch (err) {
      return serverError('Failed to fetch sales', err)
    }
  },

  async listSalesLedger(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    if (!branchId) return badRequest('branch_id required')
    const { page, limit } = getPagination(searchParams)
    try {
      const { data, count } = await PosService.getSalesLedger(branchId, {
        page,
        limit,
        from: searchParams.get('from') ?? undefined,
        to: searchParams.get('to') ?? undefined,
        type: searchParams.get('type') ?? undefined,
        status: searchParams.get('status') ?? undefined,
        search: searchParams.get('search') ?? undefined,
      })
      return ok(data, { page, limit, total: count ?? 0 })
    } catch (err) {
      return serverError('Failed to fetch sales ledger', err)
    }
  },

  async deleteCashMovement(_request: NextRequest, ctx: RequestContext, id: string) {
    try {
      await PosService.deleteCashMovement(id, ctx.auth.branchId ?? null)
      return ok({})
    } catch (err: any) {
      return badRequest(err?.message ?? 'Failed to delete cash movement')
    }
  },

  async recordCreditPayment(request: NextRequest, ctx: RequestContext, saleId: string) {
    const schema = z.object({
      amount: z.number().positive(),
      payment_method: z.enum(['cash', 'card']),
    })
    const { data, error } = await validateBody(request, schema)
    if (error) return error
    try {
      await PosService.recordCreditPayment(saleId, data.amount, data.payment_method, ctx.businessId, ctx.auth.userId)
      return ok({})
    } catch (err: any) {
      return badRequest(err?.message ?? 'Failed to record payment')
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

  async generateReceiptPdf(_request: NextRequest, ctx: RequestContext, id: string, paymentId?: string) {
    try {
      // Always regenerate — PDF content depends on invoice design settings which can
      // change at any time, so a cached copy would silently ignore setting updates.
      const result = await buildReceiptBuffer(id, ctx.auth.branchId ?? null, ctx.businessId, paymentId)
      if (!result) return notFound()

      const filename = paymentId
        ? `receipt-${id.slice(-8)}-payment-${paymentId.slice(-6)}.pdf`
        : `receipt-${id.slice(-8)}.pdf`
      return new NextResponse(result.buffer as unknown as BodyInit, {
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

  async updateSale(request: NextRequest, ctx: RequestContext, id: string) {
    const updateSaleSchema = z.object({
      customer_id: z.string().uuid().optional().nullable(),
      payment_method: z.enum(['cash', 'card', 'gift_card', 'split']).optional(),
      // 'refunded' is intentionally excluded — it must only be set by the
      // dedicated refund flow (PosController.processRefund), which creates a
      // proper negative refund sale record and reverses inventory. Allowing it
      // here let staff mark a sale "Refunded" without any of that happening,
      // producing a second, disconnected refund entry when the real refund was
      // then also processed.
      payment_status: z.enum(['paid', 'partial']).optional(),
      notes: z.string().optional().nullable(),
      discount: z.number().min(0).optional(),
      tax: z.number().min(0).optional(),
      items: z.array(z.object({
        id: z.string().uuid(),
        quantity: z.number().int().positive(),
        unit_price: z.number().min(0),
        discount: z.number().min(0),
        total: z.number().min(0),
      })).optional(),
    })
    const { data, error } = await validateBody(request, updateSaleSchema)
    if (error) return error
    const businessId = ctx.businessId
    try {
      await PosService.updateSale(id, data, businessId, ctx.auth.userId ?? '')
      return ok({ updated: true })
    } catch (err: any) {
      if (err?.message?.includes('not found')) return notFound('Sale not found')
      if (err?.message?.includes('Cannot edit')) return badRequest(err.message)
      return serverError('Failed to update sale', err)
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

  async processExchange(request: NextRequest, ctx: RequestContext) {
    const exchangeItemSchema = z.object({
      product_id: z.string().uuid().optional().nullable(),
      variant_id: z.string().uuid().optional().nullable(),
      name: z.string().min(1),
      quantity: z.number().int().positive(),
      unit_price: z.number().min(0),
      total: z.number().min(0),
      is_service: z.boolean().default(false),
    })
    const schema = z.object({
      original_sale_id: z.string().uuid(),
      branch_id: z.string().uuid(),
      cashier_id: z.string().uuid(),
      customer_id: z.string().uuid().optional().nullable(),
      returned_items: z.array(exchangeItemSchema).min(1),
      new_items: z.array(exchangeItemSchema).min(1),
      payment_method: z.enum(['cash', 'card', 'on_account']),
      amount_paid: z.number().min(0).default(0),
    })
    const { data, error } = await validateBody(request, schema)
    if (error) return error
    try {
      const result = await PosService.processExchange(data)
      return created(result)
    } catch (err: any) {
      if (err?.code === 'P0001' && err?.message) return badRequest(err.message, 'EXCHANGE_ERROR')
      return serverError('Failed to process exchange', err)
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
