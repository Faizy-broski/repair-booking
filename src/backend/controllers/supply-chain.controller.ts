import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { SupplierService, PurchaseOrderService, GrnService, SpecialOrderService } from '@/backend/services/supply-chain.service'
import { ok, created, notFound, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { getPagination } from '@/backend/utils/pagination'
import { z } from 'zod'

// ── Suppliers ────────────────────────────────────────────────────────────────

const supplierSchema = z.object({
  name:               z.string().min(1),
  contact_person:     z.string().optional().nullable(),
  email:              z.string().email().optional().nullable().or(z.literal('')),
  phone:              z.string().optional().nullable(),
  mobile:             z.string().optional().nullable(),
  address:            z.string().optional().nullable(),
  city:               z.string().optional().nullable(),
  country:            z.string().optional().nullable(),
  tax_id:             z.string().optional().nullable(),
  payment_terms_days: z.number().int().min(0).default(30),
  currency:           z.string().default('GBP'),
  notes:              z.string().optional().nullable(),
  is_active:          z.boolean().default(true),
})

export const SupplierController = {
  async list(_req: NextRequest, ctx: RequestContext) {
    try { return ok(await SupplierService.list(ctx.businessId)) }
    catch (err) { return serverError('Failed to fetch suppliers', err) }
  },
  async create(req: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(req, supplierSchema)
    if (error) return error
    try { return created(await SupplierService.create({ ...data, business_id: ctx.businessId })) }
    catch (err) { return serverError('Failed to create supplier', err) }
  },
  async update(req: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(req, supplierSchema.partial())
    if (error) return error
    try { return ok(await SupplierService.update(id, ctx.businessId, data)) }
    catch (err) { return serverError('Failed to update supplier', err) }
  },
  async remove(_req: NextRequest, ctx: RequestContext, id: string) {
    try { await SupplierService.remove(id, ctx.businessId); return ok({ id }) }
    catch (err) { return serverError('Failed to delete supplier', err) }
  },
}

// ── Purchase Orders ──────────────────────────────────────────────────────────

const poItemSchema = z.object({
  product_id:       z.string().uuid().optional(),
  name:             z.string().min(1),
  sku:              z.string().optional(),
  quantity_ordered: z.number().int().positive(),
  unit_cost:        z.number().min(0),
})

const createPoSchema = z.object({
  supplier_id:            z.string().uuid(),
  notes:                  z.string().optional(),
  expected_delivery_date: z.string().optional(),
  items:                  z.array(poItemSchema).min(1),
})

const updatePoSchema = z.object({
  supplier_id:            z.string().uuid().optional(),
  notes:                  z.string().nullable().optional(),
  expected_delivery_date: z.string().nullable().optional(),
  items:                  z.array(poItemSchema).min(1).optional(),
})

const statusSchema = z.object({ status: z.enum(['draft','pending','in_progress','received','cancelled']) })

export const PurchaseOrderController = {
  async list(req: NextRequest, ctx: RequestContext) {
    const { searchParams } = req.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? ''
    const { page, limit } = getPagination(searchParams)
    try {
      const { data, count } = await PurchaseOrderService.list(ctx.businessId, branchId, {
        status: searchParams.get('status') ?? undefined, page, limit,
      })
      return ok(data, { page, limit, total: count ?? 0 })
    } catch (err) {
      return serverError('Failed to fetch purchase orders', err)
    }
  },

  async getById(req: NextRequest, ctx: RequestContext, id: string) {
    try {
      const po = await PurchaseOrderService.getById(id, ctx.businessId)
      if (!po) return notFound('Purchase order not found')
      return ok(po)
    } catch (err) {
      return serverError('Failed to fetch purchase order', err)
    }
  },

  async create(req: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(req, createPoSchema)
    if (error) return error
    const branchId = req.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? ''
    try {
      const po = await PurchaseOrderService.create(ctx.businessId, branchId, {
        ...data, created_by: ctx.auth.userId,
      })
      return created(po)
    } catch (err) {
      return serverError('Failed to create purchase order', err)
    }
  },

  async updateStatus(req: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(req, statusSchema)
    if (error) return error
    try { return ok(await PurchaseOrderService.updateStatus(id, ctx.businessId, data.status)) }
    catch (err) { return serverError('Failed to update PO status', err) }
  },

  async update(req: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(req, updatePoSchema)
    if (error) return error
    try {
      const po = await PurchaseOrderService.update(id, ctx.businessId, data)
      return ok(po)
    } catch (err) {
      return serverError('Failed to update purchase order', err)
    }
  },

  async clone(req: NextRequest, ctx: RequestContext, id: string) {
    const branchId = req.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? ''
    try {
      const po = await PurchaseOrderService.clone(id, ctx.businessId, branchId, ctx.auth.userId)
      return created(po)
    } catch (err) {
      return serverError('Failed to clone purchase order', err)
    }
  },

  async createFromLowStock(req: NextRequest, ctx: RequestContext) {
    const schema = z.object({
      supplier_id: z.string().uuid(),
      items: z.array(z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().positive(),
      })).min(1),
    })
    const { data, error } = await validateBody(req, schema)
    if (error) return error
    const branchId = req.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? ''
    try {
      const po = await PurchaseOrderService.createFromLowStock(
        ctx.businessId, branchId, data.supplier_id, data.items, ctx.auth.userId
      )
      return created(po)
    } catch (err) {
      return serverError('Failed to create PO from low stock', err)
    }
  },
}

// ── GRN ──────────────────────────────────────────────────────────────────────

const grnSchema = z.object({
  notes: z.string().optional(),
  items: z.array(z.object({
    po_item_id:        z.string().uuid(),
    quantity_received: z.number().int().min(0),
    notes:             z.string().optional(),
  })).min(1),
})

export const GrnController = {
  async create(req: NextRequest, ctx: RequestContext, poId: string) {
    const { data, error } = await validateBody(req, grnSchema)
    if (error) return error
    const branchId = req.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? ''
    try {
      const grn = await GrnService.create(ctx.businessId, branchId, poId, ctx.auth.userId ?? '', data.items, data.notes)
      return created(grn)
    } catch (err) {
      return serverError('Failed to process GRN', err)
    }
  },
}

// ── Special Orders ───────────────────────────────────────────────────────────

const specialOrderSchema = z.object({
  name:        z.string().min(1),
  quantity:    z.number().int().positive().default(1),
  unit_cost:   z.number().min(0).default(0),
  repair_id:   z.string().uuid().optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  product_id:  z.string().uuid().optional().nullable(),
  tracking_id: z.string().optional().nullable(),
  notes:       z.string().optional().nullable(),
})

export const SpecialOrderController = {
  async list(req: NextRequest, ctx: RequestContext) {
    const status = req.nextUrl.searchParams.get('status') ?? undefined
    try { return ok(await SpecialOrderService.list(ctx.businessId, { status })) }
    catch (err) { return serverError('Failed to fetch special orders', err) }
  },

  async create(req: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(req, specialOrderSchema)
    if (error) return error
    const branchId = ctx.auth.branchId ?? ''
    try {
      return created(await SpecialOrderService.create({
        ...data, business_id: ctx.businessId, branch_id: branchId,
      }))
    } catch (err) {
      return serverError('Failed to create special order', err)
    }
  },

  async updateStatus(req: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(req, z.object({
      status:      z.enum(['pending','ordered','received','linked']),
      tracking_id: z.string().optional(),
    }))
    if (error) return error
    try {
      return ok(await SpecialOrderService.updateStatus(id, ctx.businessId, data.status, data.tracking_id))
    } catch (err) {
      return serverError('Failed to update special order', err)
    }
  },
}
