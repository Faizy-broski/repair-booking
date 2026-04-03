import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import {
  ServiceCategoryService,
  ServiceManufacturerService,
  ServiceDeviceService,
  ServiceProblemService,
} from '@/backend/services/service-hierarchy.service'
import { ok, created, notFound, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

// ── Schemas ──────────────────────────────────────────────────────────────────

const categorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  parent_id: z.string().uuid().nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  retail_margin: z.number().min(0).max(100).default(0),
  show_on_pos: z.boolean().default(true),
  display_order: z.number().int().default(0),
})

const manufacturerSchema = z.object({
  name: z.string().min(1),
  logo_url: z.string().url().nullable().optional(),
})

const deviceSchema = z.object({
  manufacturer_id: z.string().uuid().optional(),
  brand_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  image_url: z.string().url().nullable().optional(),
  colors: z.array(z.string()).default([]),
})

const problemSchema = z.object({
  name: z.string().min(1),
  category_id: z.string().uuid().nullable().optional(),
  device_id: z.string().uuid().nullable().optional(),
  price: z.number().min(0).default(0),
  cost: z.number().min(0).default(0),
  warranty_days: z.number().int().min(0).default(0),
  tax_class: z.string().nullable().optional(),
  show_on_pos: z.boolean().default(true),
  show_on_portal: z.boolean().default(true),
  use_for_all_models: z.boolean().default(false),
  notes: z.string().nullable().optional(),
})

const partSchema = z.object({
  product_id: z.string().uuid(),
  default_qty: z.number().int().positive().default(1),
  default_warranty_days: z.number().int().min(0).default(0),
  part_status: z.enum(['used', 'faulty', 'broken']).default('used'),
})

// ── Category Controller ──────────────────────────────────────────────────────

export const ServiceCategoryController = {
  async list(_req: NextRequest, ctx: RequestContext) {
    try {
      const data = await ServiceCategoryService.list(ctx.businessId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch service categories', err)
    }
  },

  async create(req: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(req, categorySchema)
    if (error) return error
    try {
      const row = await ServiceCategoryService.create({ ...data, business_id: ctx.businessId })
      return created(row)
    } catch (err) {
      return serverError('Failed to create service category', err)
    }
  },

  async update(req: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(req, categorySchema.partial())
    if (error) return error
    try {
      const row = await ServiceCategoryService.update(id, ctx.businessId, data)
      if (!row) return notFound('Category not found')
      return ok(row)
    } catch (err) {
      return serverError('Failed to update service category', err)
    }
  },

  async remove(_req: NextRequest, ctx: RequestContext, id: string) {
    try {
      await ServiceCategoryService.remove(id, ctx.businessId)
      return ok({ id })
    } catch (err) {
      return serverError('Failed to delete service category', err)
    }
  },
}

// ── Manufacturer Controller ──────────────────────────────────────────────────

export const ServiceManufacturerController = {
  async list(_req: NextRequest, ctx: RequestContext) {
    try {
      const data = await ServiceManufacturerService.list(ctx.businessId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch manufacturers', err)
    }
  },

  async create(req: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(req, manufacturerSchema)
    if (error) return error
    try {
      const row = await ServiceManufacturerService.create({ ...data, business_id: ctx.businessId })
      return created(row)
    } catch (err) {
      return serverError('Failed to create manufacturer', err)
    }
  },

  async update(req: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(req, manufacturerSchema.partial())
    if (error) return error
    try {
      const row = await ServiceManufacturerService.update(id, ctx.businessId, data)
      if (!row) return notFound('Manufacturer not found')
      return ok(row)
    } catch (err) {
      return serverError('Failed to update manufacturer', err)
    }
  },

  async remove(_req: NextRequest, ctx: RequestContext, id: string) {
    try {
      await ServiceManufacturerService.remove(id, ctx.businessId)
      return ok({ id })
    } catch (err) {
      return serverError('Failed to delete manufacturer', err)
    }
  },
}

// ── Device Controller ────────────────────────────────────────────────────────

export const ServiceDeviceController = {
  async list(req: NextRequest, ctx: RequestContext) {
    const manufacturerId = req.nextUrl.searchParams.get('manufacturer_id') ?? undefined
    const brandId = req.nextUrl.searchParams.get('brand_id') ?? undefined
    try {
      const data = await ServiceDeviceService.list(ctx.businessId, manufacturerId, brandId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch devices', err)
    }
  },

  async create(req: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(req, deviceSchema)
    if (error) return error
    try {
      const row = await ServiceDeviceService.create({ ...data, business_id: ctx.businessId })
      return created(row)
    } catch (err) {
      return serverError('Failed to create device', err)
    }
  },

  async update(req: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(req, deviceSchema.partial())
    if (error) return error
    try {
      const row = await ServiceDeviceService.update(id, ctx.businessId, data)
      if (!row) return notFound('Device not found')
      return ok(row)
    } catch (err) {
      return serverError('Failed to update device', err)
    }
  },

  async remove(_req: NextRequest, ctx: RequestContext, id: string) {
    try {
      await ServiceDeviceService.remove(id, ctx.businessId)
      return ok({ id })
    } catch (err) {
      return serverError('Failed to delete device', err)
    }
  },
}

// ── Problem Controller ───────────────────────────────────────────────────────

export const ServiceProblemController = {
  async list(req: NextRequest, ctx: RequestContext) {
    const { searchParams } = req.nextUrl
    try {
      const data = await ServiceProblemService.list(ctx.businessId, {
        deviceId:   searchParams.get('device_id')   ?? undefined,
        categoryId: searchParams.get('category_id') ?? undefined,
      })
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch service problems', err)
    }
  },

  async getById(req: NextRequest, ctx: RequestContext, id: string) {
    try {
      const row = await ServiceProblemService.getById(id, ctx.businessId)
      if (!row) return notFound('Problem not found')
      return ok(row)
    } catch (err) {
      return serverError('Failed to fetch service problem', err)
    }
  },

  async create(req: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(req, problemSchema)
    if (error) return error
    try {
      const row = await ServiceProblemService.create({ ...data, business_id: ctx.businessId })
      return created(row)
    } catch (err) {
      return serverError('Failed to create service problem', err)
    }
  },

  async update(req: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(req, problemSchema.partial())
    if (error) return error
    try {
      const row = await ServiceProblemService.update(id, ctx.businessId, data)
      if (!row) return notFound('Problem not found')
      return ok(row)
    } catch (err) {
      return serverError('Failed to update service problem', err)
    }
  },

  async remove(_req: NextRequest, ctx: RequestContext, id: string) {
    try {
      await ServiceProblemService.remove(id, ctx.businessId)
      return ok({ id })
    } catch (err) {
      return serverError('Failed to delete service problem', err)
    }
  },

  async setParts(req: NextRequest, _ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(req, z.object({ parts: z.array(partSchema) }))
    if (error) return error
    try {
      const rows = await ServiceProblemService.setParts(id, data.parts)
      return ok(rows)
    } catch (err) {
      return serverError('Failed to update problem parts', err)
    }
  },
}
