import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { validateBranchAccess } from '@/backend/middleware/branch.middleware'
import { SupplierReturnService } from '@/backend/services/supplier-return.service'
import { ok, created, badRequest, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { getPagination } from '@/backend/utils/pagination'
import { z } from 'zod'

const returnItemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  po_item_id: z.string().uuid().nullable().optional(),
  name:       z.string().min(1),
  sku:        z.string().nullable().optional(),
  quantity:   z.number().int().positive(),
  unit_cost:  z.number().min(0),
  reason:     z.string().nullable().optional(),
})

const createReturnSchema = z.object({
  supplier_id: z.string().uuid(),
  po_id:       z.string().uuid().nullable().optional(),
  notes:       z.string().nullable().optional(),
  items:       z.array(returnItemSchema).min(1),
})

const updateItemsSchema = z.object({
  notes: z.string().nullable().optional(),
  items: z.array(returnItemSchema).min(1),
})

const resolveSchema = z.object({
  resolution_type:   z.enum(['replacement', 'credit', 'refund']),
  resolution_amount: z.number().min(0).nullable().optional(),
  resolution_note:   z.string().nullable().optional(),
})

export const SupplierReturnController = {
  async list(req: NextRequest, ctx: RequestContext) {
    const { searchParams } = req.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    if (!branchId) return ok([], { page: 1, limit: 20, total: 0 })
    const { valid, error: branchErr } = await validateBranchAccess(branchId, ctx.businessId)
    if (!valid) return branchErr
    const { page, limit } = getPagination(searchParams)
    try {
      const { data, count } = await SupplierReturnService.list(ctx.businessId, branchId, {
        status:     searchParams.get('status') ?? undefined,
        supplierId: searchParams.get('supplier_id') ?? undefined,
        poId:       searchParams.get('po_id') ?? undefined,
        page, limit,
      })
      return ok(data, { page, limit, total: count })
    } catch (err) {
      return serverError('Failed to fetch supplier returns', err)
    }
  },

  async getById(_req: NextRequest, ctx: RequestContext, id: string) {
    try {
      const data = await SupplierReturnService.getById(id, ctx.businessId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch supplier return', err)
    }
  },

  async create(req: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(req, createReturnSchema)
    if (error) return error
    const branchId = req.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    if (!branchId) return badRequest('branch_id is required')
    const { valid, error: branchErr } = await validateBranchAccess(branchId, ctx.businessId)
    if (!valid) return branchErr
    try {
      const ret = await SupplierReturnService.create(ctx.businessId, branchId, {
        ...data, created_by: ctx.auth.userId,
      })
      return created(ret)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create supplier return'
      return badRequest(msg)
    }
  },

  async updateItems(req: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(req, updateItemsSchema)
    if (error) return error
    try {
      const ret = await SupplierReturnService.updateItems(id, ctx.businessId, data)
      return ok(ret)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update supplier return'
      return badRequest(msg)
    }
  },

  async ship(req: NextRequest, ctx: RequestContext, id: string) {
    const branchId = req.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    if (!branchId) return badRequest('branch_id query param is required')
    const { valid, error: branchErr } = await validateBranchAccess(branchId, ctx.businessId)
    if (!valid) return branchErr
    try {
      const ret = await SupplierReturnService.ship(id, ctx.businessId, branchId, ctx.auth.userId)
      return ok(ret)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to ship supplier return'
      return badRequest(msg)
    }
  },

  async cancel(req: NextRequest, ctx: RequestContext, id: string) {
    const branchId = req.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    if (!branchId) return badRequest('branch_id query param is required')
    const { valid, error: branchErr } = await validateBranchAccess(branchId, ctx.businessId)
    if (!valid) return branchErr
    try {
      const ret = await SupplierReturnService.cancel(id, ctx.businessId, branchId, ctx.auth.userId)
      return ok(ret)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel supplier return'
      return badRequest(msg)
    }
  },

  async resolve(req: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(req, resolveSchema)
    if (error) return error
    try {
      const ret = await SupplierReturnService.resolve(id, ctx.businessId, data, ctx.auth.userId)
      return ok(ret)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resolve supplier return'
      return badRequest(msg)
    }
  },
}
