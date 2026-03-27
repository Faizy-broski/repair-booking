import { NextRequest } from 'next/server'
import { z } from 'zod'
import { type RequestContext } from '@/backend/middleware'
import { validateBody } from '@/backend/utils/validate'
import { ok, created, serverError } from '@/backend/utils/api-response'
import { getPagination } from '@/backend/utils/pagination'
import {
  SerialService,
  CountService,
  BundleService,
  TradeInService,
} from '@/backend/services/advanced-inventory.service'

// ── Serialized Units ────────────────────────────────────────

export const SerialController = {
  async list(req: NextRequest, ctx: RequestContext, id: string) {
    const branchId = ctx.auth.branchId ?? req.nextUrl.searchParams.get('branch_id') ?? ''
    try { return ok(await SerialService.list(id, branchId)) }
    catch (err) { return serverError('Failed to fetch serials', err) }
  },

  async create(req: NextRequest, ctx: RequestContext, id: string) {
    const schema = z.object({
      branch_id:        z.string().uuid(),
      serial_number:    z.string().min(1),
      imei:             z.string().optional(),
      notes:            z.string().optional(),
      purchase_order_id: z.string().uuid().optional(),
    })
    const { data, error } = await validateBody(req, schema)
    if (error) return error
    try { return created(await SerialService.create({ product_id: id, ...data })) }
    catch (err) { return serverError('Failed to create serial', err) }
  },

  async bulkCreate(req: NextRequest, _ctx: RequestContext, id: string) {
    const schema = z.object({
      branch_id: z.string().uuid(),
      serials: z.array(z.object({
        serial_number: z.string().min(1),
        imei: z.string().optional(),
      })),
    })
    const { data, error } = await validateBody(req, schema)
    if (error) return error
    try {
      return created(await SerialService.bulkCreate(
        data.serials.map((s) => ({ product_id: id, branch_id: data.branch_id, ...s }))
      ))
    }
    catch (err) { return serverError('Failed to bulk create serials', err) }
  },

  async updateStatus(req: NextRequest, _ctx: RequestContext, id: string) {
    const schema = z.object({
      status:    z.enum(['in_stock', 'sold', 'in_repair', 'returned', 'damaged']),
      sale_id:   z.string().uuid().optional(),
      repair_id: z.string().uuid().optional(),
    })
    const { data, error } = await validateBody(req, schema)
    if (error) return error
    try { return ok(await SerialService.updateStatus(id, data.status, { sale_id: data.sale_id, repair_id: data.repair_id })) }
    catch (err) { return serverError('Failed to update serial status', err) }
  },

  async remove(_req: NextRequest, _ctx: RequestContext, id: string) {
    try { await SerialService.remove(id); return ok({ deleted: true }) }
    catch (err) { return serverError('Failed to delete serial', err) }
  },
}

// ── Inventory Counts ────────────────────────────────────────

export const CountController = {
  async list(req: NextRequest, ctx: RequestContext) {
    const branchId = ctx.auth.branchId ?? req.nextUrl.searchParams.get('branch_id') ?? ''
    try { return ok(await CountService.list(branchId)) }
    catch (err) { return serverError('Failed to fetch counts', err) }
  },

  async create(req: NextRequest, ctx: RequestContext) {
    const schema = z.object({
      branch_id:   z.string().uuid(),
      business_id: z.string().uuid(),
      name:        z.string().min(1).default('Stock Count'),
      notes:       z.string().optional(),
    })
    const { data, error } = await validateBody(req, schema)
    if (error) return error
    try {
      return created(await CountService.create({ ...data, started_by: ctx.auth.userId }))
    }
    catch (err) { return serverError('Failed to create count', err) }
  },

  async getById(_req: NextRequest, _ctx: RequestContext, id: string) {
    try { return ok(await CountService.getById(id)) }
    catch (err) { return serverError('Failed to fetch count', err) }
  },

  async updateCounts(req: NextRequest, _ctx: RequestContext, id: string) {
    const schema = z.object({
      updates: z.array(z.object({
        item_id:     z.string().uuid(),
        counted_qty: z.number().int().min(0),
        notes:       z.string().optional(),
      })),
    })
    const { data, error } = await validateBody(req, schema)
    if (error) return error
    try { await CountService.updateCounts(id, data.updates); return ok({ success: true }) }
    catch (err) { return serverError('Failed to save counts', err) }
  },

  async complete(_req: NextRequest, ctx: RequestContext, id: string) {
    try { await CountService.complete(id, ctx.auth.userId); return ok({ success: true }) }
    catch (err) { return serverError('Failed to complete count', err) }
  },

  async cancel(_req: NextRequest, _ctx: RequestContext, id: string) {
    try { await CountService.cancel(id); return ok({ success: true }) }
    catch (err) { return serverError('Failed to cancel count', err) }
  },
}

// ── Bundles ─────────────────────────────────────────────────

export const BundleController = {
  async list(req: NextRequest, ctx: RequestContext) {
    const businessId = ctx.businessId ?? req.nextUrl.searchParams.get('business_id') ?? ''
    try { return ok(await BundleService.list(businessId)) }
    catch (err) { return serverError('Failed to fetch bundles', err) }
  },

  async create(req: NextRequest, ctx: RequestContext) {
    const schema = z.object({
      business_id:  z.string().uuid(),
      name:         z.string().min(1),
      bundle_price: z.number().min(0),
      description:  z.string().optional(),
      sku:          z.string().optional(),
      is_active:    z.boolean().default(true),
      items: z.array(z.object({
        product_id: z.string().uuid(),
        quantity:   z.number().int().min(1),
      })).min(1),
    })
    const { data, error } = await validateBody(req, schema)
    if (error) return error
    try { return created(await BundleService.create(data)) }
    catch (err) { return serverError('Failed to create bundle', err) }
  },

  async update(req: NextRequest, _ctx: RequestContext, id: string) {
    const schema = z.object({
      name:         z.string().min(1).optional(),
      bundle_price: z.number().min(0).optional(),
      description:  z.string().optional(),
      sku:          z.string().optional(),
      is_active:    z.boolean().optional(),
      items: z.array(z.object({
        product_id: z.string().uuid(),
        quantity:   z.number().int().min(1),
      })).optional(),
    })
    const { data, error } = await validateBody(req, schema)
    if (error) return error
    try { return ok(await BundleService.update(id, data)) }
    catch (err) { return serverError('Failed to update bundle', err) }
  },

  async remove(_req: NextRequest, _ctx: RequestContext, id: string) {
    try { await BundleService.remove(id); return ok({ deleted: true }) }
    catch (err) { return serverError('Failed to delete bundle', err) }
  },
}

// ── Trade-In ────────────────────────────────────────────────

export const TradeInController = {
  async list(req: NextRequest, ctx: RequestContext) {
    const branchId = ctx.auth.branchId ?? req.nextUrl.searchParams.get('branch_id') ?? ''
    const { page } = getPagination(req.nextUrl.searchParams)
    try {
      const { data, total } = await TradeInService.list(branchId, page)
      return ok(data, { page, total })
    }
    catch (err) { return serverError('Failed to fetch trade-ins', err) }
  },

  async create(req: NextRequest, ctx: RequestContext) {
    const schema = z.object({
      business_id:     z.string().uuid(),
      branch_id:       z.string().uuid(),
      product_id:      z.string().uuid(),
      trade_in_value:  z.number().min(0),
      condition_grade: z.enum(['A', 'B', 'C', 'D', 'faulty']),
      customer_id:     z.string().uuid().optional(),
      variant_id:      z.string().uuid().optional(),
      serial_number:   z.string().optional(),
      imei:            z.string().optional(),
      notes:           z.string().optional(),
    })
    const { data, error } = await validateBody(req, schema)
    if (error) return error
    try { return created(await TradeInService.create(data)) }
    catch (err) { return serverError('Failed to create trade-in', err) }
  },
}
