import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { StoreCreditService } from '@/backend/services/store-credit.service'
import { LoyaltyService } from '@/backend/services/loyalty.service'
import { CustomerGroupService } from '@/backend/services/customer-group.service'
import { CustomerAssetService } from '@/backend/services/customer-asset.service'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, created, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

// ── Store Credits ────────────────────────────────────────────────────────────

const creditSchema  = z.object({ amount: z.number().positive(), note: z.string().optional() })
const adjustSchema  = z.object({ balance: z.number().min(0), note: z.string().min(1) })

export const StoreCreditController = {
  async getBalance(req: NextRequest, ctx: RequestContext, customerId: string) {
    try {
      const balance = await StoreCreditService.getBalance(ctx.businessId, customerId)
      const txns    = await StoreCreditService.getTransactions(ctx.businessId, customerId)
      return ok({ balance, transactions: txns })
    } catch (err) {
      return serverError('Failed to fetch store credits', err)
    }
  },

  async credit(req: NextRequest, ctx: RequestContext, customerId: string) {
    const { data, error } = await validateBody(req, creditSchema)
    if (error) return error
    try {
      const balance = await StoreCreditService.credit(ctx.businessId, customerId, data.amount, {
        note: data.note, createdBy: ctx.auth.userId,
      })
      return ok({ balance })
    } catch (err) {
      return serverError('Failed to add store credit', err)
    }
  },

  async adjust(req: NextRequest, ctx: RequestContext, customerId: string) {
    const { data, error } = await validateBody(req, adjustSchema)
    if (error) return error
    try {
      const balance = await StoreCreditService.adjust(ctx.businessId, customerId, data.balance, data.note, ctx.auth.userId)
      return ok({ balance })
    } catch (err) {
      return serverError('Failed to adjust store credit', err)
    }
  },
}

// ── Loyalty ──────────────────────────────────────────────────────────────────

const loyaltySettingsSchema = z.object({
  earn_rate:          z.number().min(0),
  redeem_rate:        z.number().min(0),
  min_redeem_points:  z.number().int().min(0),
  is_enabled:         z.boolean(),
})

const redeemSchema = z.object({ points: z.number().int().positive() })

export const LoyaltyController = {
  async getSettings(_req: NextRequest, ctx: RequestContext) {
    try {
      return ok(await LoyaltyService.getSettings(ctx.businessId))
    } catch (err) {
      return serverError('Failed to fetch loyalty settings', err)
    }
  },

  async saveSettings(req: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(req, loyaltySettingsSchema)
    if (error) return error
    try {
      return ok(await LoyaltyService.upsertSettings(ctx.businessId, data))
    } catch (err) {
      return serverError('Failed to save loyalty settings', err)
    }
  },

  async getCustomerPoints(req: NextRequest, ctx: RequestContext, customerId: string) {
    try {
      const balance = await LoyaltyService.getBalance(ctx.businessId, customerId)
      const txns    = await LoyaltyService.getTransactions(ctx.businessId, customerId)
      return ok({ balance, transactions: txns })
    } catch (err) {
      return serverError('Failed to fetch loyalty points', err)
    }
  },

  async addPoints(req: NextRequest, ctx: RequestContext, customerId: string) {
    const { data, error } = await validateBody(req, z.object({ points: z.number().int().positive(), note: z.string().optional() }))
    if (error) return error
    try {
      const balance = await LoyaltyService.addPoints(ctx.businessId, customerId, data.points, 'adjusted')
      return ok({ balance })
    } catch (err) {
      return serverError('Failed to add loyalty points', err)
    }
  },

  async redeemPoints(req: NextRequest, ctx: RequestContext, customerId: string) {
    const { data, error } = await validateBody(req, redeemSchema)
    if (error) return error
    try {
      const balance = await LoyaltyService.redeemPoints(ctx.businessId, customerId, data.points)
      return ok({ balance })
    } catch (err) {
      return serverError('Failed to redeem loyalty points', err)
    }
  },
}

// ── Customer Groups ──────────────────────────────────────────────────────────

const groupSchema = z.object({
  name:                        z.string().min(1),
  discount_percent:            z.number().min(0).max(100).default(0),
  third_party_billing_enabled: z.boolean().default(false),
  billing_contact_name:        z.string().optional().nullable(),
  billing_email:               z.string().email().optional().nullable().or(z.literal('')),
  billing_phone:               z.string().optional().nullable(),
  net_payment_days:            z.number().int().min(0).default(0),
  tax_class:                   z.string().optional().nullable(),
})

export const CustomerGroupController = {
  async list(_req: NextRequest, ctx: RequestContext) {
    try { return ok(await CustomerGroupService.list(ctx.businessId)) }
    catch (err) { return serverError('Failed to fetch customer groups', err) }
  },

  async create(req: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(req, groupSchema)
    if (error) return error
    try { return created(await CustomerGroupService.create({ ...data, business_id: ctx.businessId })) }
    catch (err) { return serverError('Failed to create customer group', err) }
  },

  async update(req: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(req, groupSchema.partial())
    if (error) return error
    try { return ok(await CustomerGroupService.update(id, ctx.businessId, data)) }
    catch (err) { return serverError('Failed to update customer group', err) }
  },

  async remove(_req: NextRequest, ctx: RequestContext, id: string) {
    try { await CustomerGroupService.remove(id, ctx.businessId); return ok({ id }) }
    catch (err) { return serverError('Failed to delete customer group', err) }
  },
}

// ── Customer Assets ──────────────────────────────────────────────────────────

const assetSchema = z.object({
  name:          z.string().min(1),
  brand:         z.string().optional().nullable(),
  model:         z.string().optional().nullable(),
  serial_number: z.string().optional().nullable(),
  imei:          z.string().optional().nullable(),
  color:         z.string().optional().nullable(),
  purchase_date: z.string().optional().nullable(),
  notes:         z.string().optional().nullable(),
})

export const CustomerAssetController = {
  async list(req: NextRequest, ctx: RequestContext, customerId: string) {
    try { return ok(await CustomerAssetService.list(ctx.businessId, customerId)) }
    catch (err) { return serverError('Failed to fetch customer assets', err) }
  },

  async create(req: NextRequest, ctx: RequestContext, customerId: string) {
    const { data, error } = await validateBody(req, assetSchema)
    if (error) return error
    try {
      return created(await CustomerAssetService.create({ ...data, business_id: ctx.businessId, customer_id: customerId }))
    } catch (err) {
      return serverError('Failed to create asset', err)
    }
  },

  async update(req: NextRequest, ctx: RequestContext, assetId: string) {
    const { data, error } = await validateBody(req, assetSchema.partial())
    if (error) return error
    try { return ok(await CustomerAssetService.update(assetId, ctx.businessId, data)) }
    catch (err) { return serverError('Failed to update asset', err) }
  },

  async remove(_req: NextRequest, ctx: RequestContext, assetId: string) {
    try { await CustomerAssetService.remove(assetId, ctx.businessId); return ok({ id: assetId }) }
    catch (err) { return serverError('Failed to delete asset', err) }
  },
}

// ── Customer Merge ───────────────────────────────────────────────────────────

export const CustomerMergeController = {
  async merge(req: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(req, z.object({
      keep_id: z.string().uuid(),
      drop_id: z.string().uuid(),
    }))
    if (error) return error
    try {
      const { error: rpcErr } = await adminSupabase.rpc('merge_customers', {
        p_keep_id: data.keep_id,
        p_drop_id: data.drop_id,
      })
      if (rpcErr) throw rpcErr
      return ok({ merged: true, kept_id: data.keep_id })
    } catch (err) {
      return serverError('Failed to merge customers', err)
    }
  },
}
