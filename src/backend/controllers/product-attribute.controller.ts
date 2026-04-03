import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { ProductAttributeService } from '@/backend/services/product-attribute.service'
import { ok, created, notFound, serverError } from '@/backend/utils/api-response'
import { z } from 'zod'
import { validateBody } from '@/backend/utils/validate'

const nameSchema = z.object({ name: z.string().min(1) })
const valueSchema = z.object({ value: z.string().min(1) })

export const ProductAttributeController = {
  // GET /api/product-attributes
  async list(_req: NextRequest, ctx: RequestContext) {
    try {
      const data = await ProductAttributeService.list(ctx.businessId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch attributes', err)
    }
  },

  // POST /api/product-attributes
  async create(req: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(req, nameSchema)
    if (error) return error
    try {
      const attr = await ProductAttributeService.create(ctx.businessId, data.name)
      return created(attr)
    } catch (err) {
      return serverError('Failed to create attribute', err)
    }
  },

  // PUT /api/product-attributes/[id]
  async update(req: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(req, nameSchema)
    if (error) return error
    try {
      const attr = await ProductAttributeService.update(id, ctx.businessId, data.name)
      return ok(attr)
    } catch (err) {
      return serverError('Failed to update attribute', err)
    }
  },

  // DELETE /api/product-attributes/[id]
  async delete(_req: NextRequest, ctx: RequestContext, id: string) {
    try {
      await ProductAttributeService.delete(id, ctx.businessId)
      return ok({ deleted: true })
    } catch (err) {
      return serverError('Failed to delete attribute', err)
    }
  },

  // POST /api/product-attributes/[id]/values
  async addValue(req: NextRequest, ctx: RequestContext, attributeId: string) {
    const { data, error } = await validateBody(req, valueSchema)
    if (error) return error
    try {
      const val = await ProductAttributeService.addValue(attributeId, ctx.businessId, data.value)
      return created(val)
    } catch (err) {
      return serverError('Failed to add value', err)
    }
  },

  // DELETE /api/product-attributes/values/[valueId]
  async deleteValue(_req: NextRequest, ctx: RequestContext, valueId: string) {
    try {
      await ProductAttributeService.deleteValue(valueId, ctx.businessId)
      return ok({ deleted: true })
    } catch (err) {
      return serverError('Failed to delete value', err)
    }
  },
}
