import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { UserService } from '@/backend/services/user.service'
import { ok, created, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const inviteSchema = z.object({
  email: z.string().email(),
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

export const UserController = {
  async list(request: NextRequest, ctx: RequestContext) {
    try {
      const data = await UserService.listByBusiness(ctx.businessId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch users', err)
    }
  },

  async invite(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, inviteSchema)
    if (error) return error
    try {
      const user = await UserService.invite({
        ...data,
        business_id: ctx.businessId,
      })
      return created(user)
    } catch (err) {
      return serverError('Failed to invite user', err)
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
}
