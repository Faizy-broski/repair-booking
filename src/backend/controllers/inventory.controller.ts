import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { InventoryService } from '@/backend/services/inventory.service'
import { ok, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { getPagination } from '@/backend/utils/pagination'
import { z } from 'zod'

const adjustSchema = z.object({
  branch_id: z.string().uuid(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  quantity: z.number().int(),
  low_stock_alert: z.number().int().min(0).optional(),
  note: z.string().optional(),
})

const setLevelSchema = z.object({
  branch_id: z.string().uuid(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(0),
  low_stock_alert: z.number().int().min(0).default(5),
})

export const InventoryController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? ''
    const { page, limit } = getPagination(searchParams)
    const lowStock = searchParams.get('low_stock') === 'true'
    try {
      const { data, count } = await InventoryService.getStock(branchId, { page, limit, lowStock })
      return ok(data, { page, limit, total: count ?? 0 })
    } catch (err) {
      return serverError('Failed to fetch inventory', err)
    }
  },

  async getLowStockAlerts(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? ''
    try {
      const data = await InventoryService.getLowStockAlerts(branchId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch low stock alerts', err)
    }
  },

  async adjust(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, adjustSchema)
    if (error) return error
    try {
      await InventoryService.adjustStock(
        data.branch_id,
        data.product_id,
        data.variant_id ?? null,
        data.quantity,
        ctx.auth.userId,
        data.note
      )
      return ok({ adjusted: true })
    } catch (err) {
      return serverError('Failed to adjust inventory', err)
    }
  },

  async setLevel(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, setLevelSchema)
    if (error) return error
    try {
      await InventoryService.setLevel(
        data.branch_id,
        data.product_id,
        data.variant_id ?? null,
        data.quantity,
        data.low_stock_alert
      )
      return ok({ updated: true })
    } catch (err) {
      return serverError('Failed to set inventory level', err)
    }
  },
}
