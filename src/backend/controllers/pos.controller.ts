import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { PosService } from '@/backend/services/pos.service'
import { CommissionService } from '@/backend/services/payroll.service'
import { ok, created, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { getPagination } from '@/backend/utils/pagination'
import { z } from 'zod'

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
  items: z.array(saleItemSchema).min(1),
})

export const PosController = {
  async processSale(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, createSaleSchema)
    if (error) return error
    try {
      const saleId = await PosService.processSale(data)
      // Fire-and-forget commission recording (never blocks the response)
      CommissionService.recordForSale(ctx.businessId, data.cashier_id, saleId, data.total).catch(() => {})
      return created({ sale_id: saleId })
    } catch (err) {
      return serverError('Failed to process sale', err)
    }
  },

  async listSales(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? ''
    const { page, limit } = getPagination(searchParams)
    try {
      const { data, count } = await PosService.getSales(branchId, {
        page,
        limit,
        from: searchParams.get('from') ?? undefined,
        to: searchParams.get('to') ?? undefined,
      })
      return ok(data, { page, limit, total: count ?? 0 })
    } catch (err) {
      return serverError('Failed to fetch sales', err)
    }
  },

  async getSaleById(request: NextRequest, ctx: RequestContext, id: string) {
    const branchId = ctx.auth.branchId ?? ''
    try {
      const sale = await PosService.getSaleById(id, branchId)
      return ok(sale)
    } catch (err) {
      return serverError('Failed to fetch sale', err)
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
