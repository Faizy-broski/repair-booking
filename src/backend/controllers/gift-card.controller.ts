import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { GiftCardService } from '@/backend/services/gift-card.service'
import { ok, created, notFound, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const createSchema = z.object({
  branch_id: z.string().uuid(),
  initial_value: z.number().positive(),
  customer_id: z.string().uuid().optional().nullable(),
  expires_at: z.string().optional().nullable(),
})

const updateSchema = z.object({
  is_active: z.boolean().optional(),
  balance: z.number().min(0).optional(),
})

export const GiftCardController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? ''
    try {
      const data = await GiftCardService.list(branchId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch gift cards', err)
    }
  },

  async getByCode(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const code = searchParams.get('code') ?? ''
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? ''
    try {
      const card = await GiftCardService.getByCode(code, branchId)
      if (!card) return notFound('Gift card not found or inactive')
      return ok(card)
    } catch (err) {
      return serverError('Failed to fetch gift card', err)
    }
  },

  async create(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, createSchema)
    if (error) return error
    const { branch_id, ...rest } = data
    try {
      const card = await GiftCardService.create(branch_id, rest)
      return created(card)
    } catch (err) {
      return serverError('Failed to create gift card', err)
    }
  },

  async update(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, updateSchema)
    if (error) return error
    try {
      if (data.is_active === false) {
        await GiftCardService.deactivate(id)
      }
      return ok({ updated: true })
    } catch (err) {
      return serverError('Failed to update gift card', err)
    }
  },
}
