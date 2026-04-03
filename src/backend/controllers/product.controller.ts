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
  image_url: z.string().url().optional().nullable(),
  show_on_pos: z.boolean().optional(),
  tax_class: z.string().optional().nullable(),
  // Item type: product or part
  item_type: z.enum(['product', 'part']).optional().default('product'),
  part_type: z.string().optional().nullable(),
  // Extended fields carried through
  model_id: z.string().uuid().optional().nullable(),
  supplier_id: z.string().uuid().optional().nullable(),
  condition: z.string().optional().nullable(),
  physical_location: z.string().optional().nullable(),
  warranty_days: z.number().int().min(0).optional(),
  imei: z.string().optional().nullable(),
  track_inventory: z.boolean().optional(),
  reorder_level: z.number().int().min(0).optional(),
  retail_markup: z.number().min(0).optional(),
  promotional_price: z.number().min(0).optional().nullable(),
  promotion_start: z.string().optional().nullable(),
  promotion_end: z.string().optional().nullable(),
  minimum_price: z.number().min(0).optional(),
  online_price: z.number().min(0).optional(),
  commission_enabled: z.boolean().optional(),
  commission_type: z.string().optional(),
  commission_rate: z.number().min(0).optional(),
  loyalty_enabled: z.boolean().optional(),
  // Initial stock settings (applied to inventory table separately)
  initial_stock: z.number().int().min(0).optional(),
  low_stock_alert: z.number().int().min(0).optional().nullable(),
  branch_id: z.string().uuid().optional().nullable(),
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
        branchId: searchParams.get('branch_id') ?? ctx.auth.branchId ?? undefined,
        includeInactive: searchParams.get('include_inactive') === 'true',
        brandId: searchParams.get('brand_id') ?? undefined,
        supplierId: searchParams.get('supplier_id') ?? undefined,
        valuation: searchParams.get('valuation') ?? undefined,
        hideOutOfStock: searchParams.get('hide_out_of_stock') === 'true',
        itemType: searchParams.get('item_type') ?? undefined,
        modelId: searchParams.get('model_id') ?? undefined,
        partType: searchParams.get('part_type') ?? undefined,
      })
      return ok(data, { page, limit, total: count ?? 0 })
    } catch (err) {
      return serverError('Failed to fetch products', err)
    }
  },

  async getStats(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? undefined
    try {
      const stats = await ProductService.getStats(ctx.businessId, branchId)
      return ok(stats)
    } catch (err) {
      return serverError('Failed to fetch product stats', err)
    }
  },

  async getById(request: NextRequest, ctx: RequestContext, id: string) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? undefined
    try {
      const product = await ProductService.getById(id, ctx.businessId, branchId)
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
      const { initial_stock, low_stock_alert, branch_id, ...productData } = data
      const product = await ProductService.create({ ...productData, business_id: ctx.businessId } as any)

      // Seed initial inventory row if stock provided
      const targetBranch = branch_id ?? ctx.auth.branchId
      const needsStock = productData.item_type === 'part' || !productData.is_service
      if (targetBranch && needsStock && (initial_stock ?? 0) > 0) {
        const { adminSupabase } = await import('@/backend/config/supabase')
        await adminSupabase.from('inventory').upsert(
          { branch_id: targetBranch, product_id: product.id, quantity: initial_stock ?? 0, low_stock_alert: low_stock_alert ?? 5 },
          { onConflict: 'branch_id,product_id' }
        )
      } else if (targetBranch && needsStock) {
        // Always create an inventory row so stock can be tracked
        const { adminSupabase } = await import('@/backend/config/supabase')
        await adminSupabase.from('inventory').upsert(
          { branch_id: targetBranch, product_id: product.id, quantity: 0, low_stock_alert: low_stock_alert ?? 5 },
          { onConflict: 'branch_id,product_id' }
        )
      }

      return created(product)
    } catch (err) {
      return serverError('Failed to create product', err)
    }
  },

  async update(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, updateSchema)
    if (error) return error
    try {
      const { initial_stock, low_stock_alert, branch_id, ...productData } = data
      const product = await ProductService.update(id, ctx.businessId, productData as any)

      // Sync low_stock_alert to the inventory table for the target branch
      const targetBranch = branch_id ?? ctx.auth.branchId
      if (targetBranch && low_stock_alert !== undefined) {
        const { adminSupabase } = await import('@/backend/config/supabase')
        // Check if inventory row exists
        const { data: existing } = await adminSupabase
          .from('inventory')
          .select('id')
          .eq('branch_id', targetBranch)
          .eq('product_id', id)
          .maybeSingle()
        if (existing) {
          await adminSupabase.from('inventory')
            .update({ low_stock_alert: low_stock_alert ?? 5 })
            .eq('branch_id', targetBranch)
            .eq('product_id', id)
        } else {
          await adminSupabase.from('inventory').insert({
            branch_id: targetBranch,
            product_id: id,
            quantity: initial_stock ?? 0,
            low_stock_alert: low_stock_alert ?? 5,
          })
        }
      }

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

  // ── Group Pricing endpoints ───────────────────────────────────────────────

  async getGroupPricing(_request: NextRequest, ctx: RequestContext, productId: string) {
    try {
      const data = await ProductService.getGroupPricing(productId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch group pricing', err)
    }
  },

  async setGroupPricing(request: NextRequest, ctx: RequestContext, productId: string) {
    const schema = z.object({
      entries: z.array(z.object({
        customer_group_id: z.string().uuid(),
        price: z.number().min(0),
      })),
    })
    const { data, error } = await validateBody(request, schema)
    if (error) return error
    try {
      const result = await ProductService.setGroupPricing(productId, data.entries)
      return ok(result)
    } catch (err) {
      return serverError('Failed to set group pricing', err)
    }
  },

  // ── History endpoints ──────────────────────────────────────────────────────

  async getHistory(request: NextRequest, ctx: RequestContext, productId: string) {
    const category = request.nextUrl.searchParams.get('category') ?? undefined
    try {
      const data = await ProductService.getHistory(productId, ctx.businessId, category)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch product history', err)
    }
  },

  // ── Variant endpoints ─────────────────────────────────────────────────────

  async listVariants(_request: NextRequest, ctx: RequestContext, productId: string) {
    try {
      const data = await ProductService.listVariants(productId, ctx.businessId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch variants', err)
    }
  },

  async createVariants(request: NextRequest, ctx: RequestContext, productId: string) {
    const variantSchema = z.object({
      variants: z.array(z.object({
        name: z.string().min(1),
        sku: z.string().optional().nullable(),
        barcode: z.string().optional().nullable(),
        selling_price: z.number().min(0),
        cost_price: z.number().min(0).optional().nullable(),
        attributes: z.record(z.string(), z.string()).optional(),
      })).min(1),
    })
    const { data, error } = await validateBody(request, variantSchema)
    if (error) return error
    try {
      const result = await ProductService.createVariants(productId, ctx.businessId, data.variants)
      return created(result)
    } catch (err) {
      return serverError('Failed to create variants', err)
    }
  },

  async updateVariant(request: NextRequest, ctx: RequestContext, productId: string, variantId: string) {
    const updateVariantSchema = z.object({
      name: z.string().min(1).optional(),
      sku: z.string().optional().nullable(),
      barcode: z.string().optional().nullable(),
      selling_price: z.number().min(0).optional(),
      cost_price: z.number().min(0).optional().nullable(),
      attributes: z.record(z.string(), z.string()).optional(),
    })
    const { data, error } = await validateBody(request, updateVariantSchema)
    if (error) return error
    try {
      const result = await ProductService.updateVariant(variantId, productId, ctx.businessId, data)
      return ok(result)
    } catch (err) {
      return serverError('Failed to update variant', err)
    }
  },

  async deleteVariant(_request: NextRequest, ctx: RequestContext, productId: string, variantId: string) {
    try {
      await ProductService.deleteVariant(variantId, productId, ctx.businessId)
      return ok({ deleted: true })
    } catch (err) {
      return serverError('Failed to delete variant', err)
    }
  },
}
