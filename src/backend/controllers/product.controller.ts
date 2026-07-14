import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { ProductService } from '@/backend/services/product.service'
import { ok, created, notFound, forbidden, serverError, conflict } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { getPagination } from '@/backend/utils/pagination'
import { PlanLimitService } from '@/backend/services/plan-limit.service'
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
  image_url: z.string().optional().nullable(),
  show_on_pos: z.boolean().optional(),
  is_draft: z.boolean().optional(),
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
  // Customer-sourced item flag
  is_trade_in: z.boolean().optional().default(false),
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
        barcode: searchParams.get('barcode') ?? undefined,
        categoryId: searchParams.get('category_id') ?? undefined,
        branchId: searchParams.get('branch_id') ?? ctx.auth.branchId ?? undefined,
        includeInactive: searchParams.get('include_inactive') === 'true',
        includeDrafts: searchParams.get('include_drafts') === 'true',
        brandId: searchParams.get('brand_id') ?? undefined,
        supplierId: searchParams.get('supplier_id') ?? undefined,
        valuation: searchParams.get('valuation') ?? undefined,
        hideOutOfStock: searchParams.get('hide_out_of_stock') === 'true',
        lowStockOnly: searchParams.get('low_stock_only') === 'true',
        itemType: searchParams.get('item_type') ?? undefined,
        modelId: searchParams.get('model_id') ?? undefined,
        partType: searchParams.get('part_type') ?? undefined,
      })
      return ok(data, { page, limit, total: count ?? 0 })
    } catch (err) {
      return serverError('Failed to fetch products', err)
    }
  },

  async findByVariantBarcode(request: NextRequest, ctx: RequestContext) {
    const barcode = request.nextUrl.searchParams.get('barcode')
    if (!barcode) return ok(null)
    try {
      const result = await ProductService.findByVariantBarcode(ctx.businessId, barcode)
      return ok(result)
    } catch (err) {
      return serverError('Failed to lookup variant barcode', err)
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
      // Check plan limit: services count against max_services, products against max_products
      const limitKey = data.is_service ? 'max_services' : 'max_products'
      const limitCheck = await PlanLimitService.checkLimit(ctx.businessId, limitKey)
      if (!limitCheck.allowed) {
        const label = data.is_service ? 'service' : 'product'
        return forbidden(`${label.charAt(0).toUpperCase() + label.slice(1)} limit reached. Your plan allows ${limitCheck.limit} ${label}s.`)
      }

      const { initial_stock, low_stock_alert, branch_id, ...productData } = data
      const product = await ProductService.create({ ...productData, business_id: ctx.businessId } as any)

      // Seed inventory + branch catalog only for the creating branch.
      // Other branches must explicitly enable the product via the branch
      // availability toggle — they do NOT get auto-seeded anymore.
      const needsStock = productData.item_type === 'part' || !productData.is_service
      const targetBranch = branch_id ?? ctx.auth.branchId
      
      if (targetBranch) {
        const { adminSupabase } = await import('@/backend/config/supabase')
        const qty = (needsStock ? initial_stock : 0) ?? 0

        // Run branch_products + inventory seeding in parallel — both depend only on product.id
        const [bpResult, invResult] = await Promise.all([
          adminSupabase
            .from('branch_products')
            .upsert(
              { branch_id: targetBranch, product_id: product.id, is_enabled: true },
              { onConflict: 'branch_id,product_id' }
            ),
          needsStock
            ? adminSupabase
                .from('inventory')
                .insert({ branch_id: targetBranch, product_id: product.id, variant_id: null, quantity: qty, low_stock_alert: low_stock_alert ?? 5 })
            : Promise.resolve({ error: null }),
        ])

        if (bpResult.error) console.error('[ProductController.create] branch_products upsert failed:', bpResult.error)
        if (invResult.error) console.error('[ProductController.create] inventory insert failed:', invResult.error)

        // Stock movement + cost layer are independent — fire after inventory insert succeeds.
        // The cost layer is what lets FIFO/LIFO products draw an accurate cost from their very
        // first sale instead of relying on the zero-layer catch-up fallback in consume_and_freeze_cost.
        if (needsStock && qty > 0 && !invResult.error) {
          const openingCost = (productData as any).cost_price ?? 0
          adminSupabase.from('stock_movements').insert({
            branch_id: targetBranch, product_id: product.id, variant_id: null,
            quantity: qty, type: 'adjustment', note: 'Opening stock', created_by: ctx.auth.userId,
          }).then(({ error }) => {
            if (error) console.error('[ProductController.create] stock_movements insert failed:', error)
          })
          adminSupabase.from('inventory_cost_layers').insert({
            branch_id: targetBranch, product_id: product.id, quantity: qty,
            unit_cost: openingCost, source_type: 'adjustment',
          }).then(({ error }) => {
            if (error) console.error('[ProductController.create] inventory_cost_layers insert failed:', error)
          })
          adminSupabase.from('products').update({ average_cost: openingCost }).eq('id', product.id).then(({ error }) => {
            if (error) console.error('[ProductController.create] average_cost update failed:', error)
          })
        }
      } else {
        console.warn('[ProductController.create] No target branch — inventory seeding skipped.')
      }

      return created(product)
    } catch (err: any) {
      if (err.code === '23505') {
        return conflict('A product with this SKU or Barcode already exists in your inventory.')
      }
      return serverError('Failed to create product', err)
    }
  },

  async duplicate(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const source = await ProductService.getById(id, ctx.businessId)
      if (!source) return notFound('Product not found')

      const limitKey = (source as any).is_service ? 'max_services' : 'max_products'
      const limitCheck = await PlanLimitService.checkLimit(ctx.businessId, limitKey)
      if (!limitCheck.allowed) {
        const label = (source as any).is_service ? 'service' : 'product'
        return forbidden(`${label.charAt(0).toUpperCase() + label.slice(1)} limit reached. Your plan allows ${limitCheck.limit} ${label}s.`)
      }

      const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? undefined
      const duplicate = await ProductService.duplicateProduct(id, ctx.businessId, branchId, ctx.auth.userId)
      return created(duplicate)
    } catch (err) {
      return serverError('Failed to duplicate product', err)
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
        const { data: existing } = await adminSupabase
          .from('inventory')
          .select('id, quantity')
          .eq('branch_id', targetBranch)
          .eq('product_id', id)
          .is('variant_id', null)
          .maybeSingle()
        const openingCost = (product as any)?.cost_price ?? 0
        if (existing) {
          const updatePayload: Record<string, unknown> = { low_stock_alert: low_stock_alert ?? 5 }
          if (initial_stock !== undefined) updatePayload.quantity = initial_stock
          const { error: updErr } = await adminSupabase.from('inventory')
            .update(updatePayload)
            .eq('branch_id', targetBranch)
            .eq('product_id', id)
            .is('variant_id', null)
          if (updErr) console.error('[ProductController.update] Update inventory error:', updErr)
          // Only a net INCREASE in stock gets a new cost layer — the product
          // form sets an absolute quantity, not a delta, so a decrease here
          // is a correction, not a new purchase, and shouldn't fabricate cost.
          const delta = initial_stock !== undefined ? initial_stock - (existing.quantity ?? 0) : 0
          if (!updErr && delta > 0) {
            const { error: layerErr } = await adminSupabase.from('inventory_cost_layers').insert({
              branch_id: targetBranch, product_id: id, quantity: delta,
              unit_cost: openingCost, source_type: 'adjustment',
            })
            if (layerErr) console.error('[ProductController.update] inventory_cost_layers insert failed:', layerErr)
          }
        } else {
          const { error: insErr } = await adminSupabase.from('inventory').insert({
            branch_id: targetBranch,
            product_id: id,
            quantity: initial_stock ?? 0,
            low_stock_alert: low_stock_alert ?? 5,
          })
          if (insErr) console.error('[ProductController.update] Insert inventory error:', insErr)
          if (!insErr && (initial_stock ?? 0) > 0) {
            const { error: layerErr } = await adminSupabase.from('inventory_cost_layers').insert({
              branch_id: targetBranch, product_id: id, quantity: initial_stock,
              unit_cost: openingCost, source_type: 'adjustment',
            })
            if (layerErr) console.error('[ProductController.update] inventory_cost_layers insert failed:', layerErr)
          }
        }
        
        // ── NEW: Ensure product is enabled in this branch's catalog ──
        await adminSupabase.from('branch_products').upsert(
          { branch_id: targetBranch, product_id: id, is_enabled: true },
          { onConflict: 'branch_id,product_id' }
        )
      }

      return ok(product)
    } catch (err: any) {
      if (err.code === '23505') {
        return conflict('Another product with this SKU or Barcode already exists.')
      }
      return serverError('Failed to update product', err)
    }
  },

  async delete(request: NextRequest, ctx: RequestContext, id: string) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? undefined
    try {
      await ProductService.delete(id, ctx.businessId, branchId)
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

  // ── Cost layer visibility (FIFO/LIFO batches) ─────────────────────────────

  async getCostLayers(request: NextRequest, ctx: RequestContext, productId: string) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? undefined
    try {
      const data = await ProductService.getCostLayers(productId, branchId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch cost layers', err)
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

  // ── Branch availability endpoints ─────────────────────────────────────────

  async getBranchAvailability(_request: NextRequest, ctx: RequestContext, productId: string) {
    try {
      const data = await ProductService.getBranchAvailability(productId, ctx.businessId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch branch availability', err)
    }
  },

  async setBranchAvailability(request: NextRequest, ctx: RequestContext, productId: string) {
    const schema = z.object({
      branch_id: z.string().uuid(),
      is_enabled: z.boolean(),
    })
    const { data, error } = await validateBody(request, schema)
    if (error) return error
    try {
      await ProductService.setBranchAvailability(productId, data.branch_id, data.is_enabled)
      return ok({ updated: true })
    } catch (err) {
      return serverError('Failed to update branch availability', err)
    }
  },

  // ── Variant endpoints ─────────────────────────────────────────────────────

  async listVariants(request: NextRequest, ctx: RequestContext, productId: string) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? undefined
    try {
      const data = await ProductService.listVariants(productId, ctx.businessId, branchId)
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
        stock: z.number().optional(),
        image_url: z.string().optional().nullable(),
      })).min(1),
      branch_id: z.string().optional()
    })
    const { data, error } = await validateBody(request, variantSchema)
    if (error) return error
    try {
      const result = await ProductService.createVariants(productId, ctx.businessId, data.variants, data.branch_id)
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
      stock: z.number().optional(),
      image_url: z.string().optional().nullable(),
      branch_id: z.string().optional()
    })
    const { data, error } = await validateBody(request, updateVariantSchema)
    if (error) return error
    try {
      const { branch_id, ...payload } = data
      const result = await ProductService.updateVariant(variantId, productId, ctx.businessId, payload, branch_id)
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
  async checkAvailability(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = new URL(request.url)
    const sku = searchParams.get('sku')
    const barcode = searchParams.get('barcode')
    const excludeId = searchParams.get('excludeId')

    try {
      const result = await ProductService.checkAvailability(ctx.businessId, { sku, barcode, excludeId })
      return ok(result)
    } catch (err) {
      return serverError('Failed to check availability', err)
    }
  },

  async recordBuyback(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, z.object({
      branch_id: z.string().uuid(),
      amount: z.number().positive(),
      product_id: z.string().uuid().optional(),
      name: z.string().min(1).optional(),
      selling_price: z.number().min(0).optional(),
      barcode: z.string().optional(),
    }).refine(d => d.product_id || (d.name && d.selling_price !== undefined), {
      message: 'Either product_id or name + selling_price is required',
    }))
    if (error) return error
    try {
      const product = await ProductService.recordBuyback(data.branch_id, ctx.businessId, data.amount, {
        product_id: data.product_id,
        name: data.name,
        selling_price: data.selling_price,
        barcode: data.barcode,
      })
      return ok(product)
    } catch (err) {
      return serverError('Failed to record buyback', err)
    }
  },
}
