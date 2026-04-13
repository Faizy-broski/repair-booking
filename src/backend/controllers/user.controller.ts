import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { UserService } from '@/backend/services/user.service'
import { ok, created, forbidden, badRequest, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { PlanLimitService } from '@/backend/services/plan-limit.service'
import { z } from 'zod'

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(1),
  role: z.enum(['branch_manager', 'staff', 'cashier']),
  branch_id: z.string().uuid().optional().nullable(),
})

const updateSchema = z.object({
  full_name: z.string().optional(),
  phone: z.string().optional().nullable(),
  role: z.enum(['branch_manager', 'staff', 'cashier']).optional(),
  branch_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
})

const resetPasswordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const UserController = {
  async list(request: NextRequest, ctx: RequestContext) {
    try {
      const data = await UserService.listByBusiness(ctx.businessId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch users', err)
    }
  },

  async create(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, createSchema)
    if (error) return error
    try {
      const limitCheck = await PlanLimitService.checkLimit(ctx.businessId, 'max_users')
      if (!limitCheck.allowed) {
        return forbidden(`User limit reached. Your plan allows ${limitCheck.limit} user${limitCheck.limit === 1 ? '' : 's'}.`)
      }

      const user = await UserService.create({
        ...data,
        business_id: ctx.businessId,
      })
      return created(user)
    } catch (err) {
      return serverError('Failed to create user', err)
    }
  },

  async update(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, updateSchema)
    if (error) return error
    try {
      const user = await UserService.update(id, ctx.businessId, data)
      return ok(user)
    } catch (err) {
      return serverError('Failed to update user', err)
    }
  },

  async resetPassword(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, resetPasswordSchema)
    if (error) return error
    try {
      await UserService.resetPassword(id, ctx.businessId, ctx.auth.userId, data.password)
      return ok({ success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reset password'
      // Surface domain-level errors (wrong business, owner role, self-reset) as 400
      if (
        msg.includes('not found') ||
        msg.includes('cannot be changed') ||
        msg.includes('own password')
      ) {
        return badRequest(msg)
      }
      return serverError('Failed to reset password', err)
    }
  },
}
