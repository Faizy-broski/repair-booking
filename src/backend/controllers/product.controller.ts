import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { ProductService } from '@/backend/services/product.service'
import { ok, created, notFound, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { getPagination } from '@/backend/utils/pagination'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1),
  category_id: z.string().uuid().optional().nullable(),
  brand_id: z.string().uuid().optional().nullable(),
  selling_price: z.number().min(0),
  cost_price: z.number().min(0).optional().default(0),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  is_service: z.boolean().default(false),
  has_variants: z.boolean().default(false),
  is_serialized: z.boolean().optional(),
  valuation_method: z.enum(['weighted_average', 'fifo', 'lifo']).optional(),
})

const updateSchema = createSchema.partial()

export const ProductController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const { page, limit } = getPagination(searchParams)
    try {
      const { data, count } = await ProductService.list(ctx.businessId, {
        page,
        limit,
        search: searchParams.get('search') ?? undefined,
        categoryId: searchParams.get('category_id') ?? undefined,
      })
      return ok(data, { page, limit, total: count ?? 0 })
    } catch (err) {
      return serverError('Failed to fetch products', err)
    }
  },

  async getById(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const product = await ProductService.getById(id, ctx.businessId)
      if (!product) return notFound('Product not found')
      return ok(product)
    } catch (err) {
      return serverError('Failed to fetch product', err)
    }
  },

  async create(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, createSchema)
    if (error) return error
    try {
      const product = await ProductService.create({ ...data, business_id: ctx.businessId })
      return created(product)
    } catch (err) {
      return serverError('Failed to create product', err)
    }
  },

  async update(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, updateSchema)
    if (error) return error
    try {
      const product = await ProductService.update(id, ctx.businessId, data)
      return ok(product)
    } catch (err) {
      return serverError('Failed to update product', err)
    }
  },

  async delete(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      await ProductService.delete(id, ctx.businessId)
      return ok({ deleted: true })
    } catch (err) {
      return serverError('Failed to delete product', err)
    }
  },
}
