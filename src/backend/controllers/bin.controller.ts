import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { validateBranchAccess } from '@/backend/middleware/branch.middleware'
import { BinService } from '@/backend/services/bin.service'
import { ok, created, badRequest, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const moveToBinSchema = z.object({
  branch_id:  z.string().uuid(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  quantity:   z.number().int().positive(),
  reason:     z.string().optional(),
})

export const BinController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    const status = searchParams.get('status') === 'restored' ? 'restored' : 'binned'
    if (!branchId) return ok([])
    const { valid, error: branchErr } = await validateBranchAccess(branchId, ctx.businessId)
    if (!valid) return branchErr
    try {
      const data = await BinService.list(branchId, status)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch bin items', err)
    }
  },

  async moveToBin(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, moveToBinSchema)
    if (error) return error
    const { valid, error: branchErr } = await validateBranchAccess(data.branch_id, ctx.businessId)
    if (!valid) return branchErr
    try {
      const item = await BinService.moveToBin(
        ctx.businessId,
        data.branch_id,
        data.product_id,
        data.variant_id ?? null,
        data.quantity,
        data.reason ?? null,
        ctx.auth.userId
      )
      return created(item)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to move item to bin'
      return badRequest(msg)
    }
  },

  async restore(request: NextRequest, ctx: RequestContext, id: string) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    if (!branchId) return badRequest('branch_id query param is required')
    const { valid, error: branchErr } = await validateBranchAccess(branchId, ctx.businessId)
    if (!valid) return branchErr
    try {
      const item = await BinService.restore(id, branchId, ctx.auth.userId)
      return ok(item)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to restore item'
      return badRequest(msg)
    }
  },
}
