import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { BusinessService } from '@/backend/services/business.service'
import { ok, notFound, serverError, badRequest } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { getPagination } from '@/backend/utils/pagination'
import { z } from 'zod'

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  logo_url: z.string().url().optional().nullable(),
  country: z.string().optional(),
  currency: z.string().optional(),
  timezone: z.string().optional(),
  is_active: z.boolean().optional(),
  is_suspended: z.boolean().optional(),
})

export const BusinessController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const { page, limit } = getPagination(searchParams)
    try {
      const { data, count } = await BusinessService.list({ page, limit, search: searchParams.get('search') ?? undefined })
      return ok(data, { page, limit, total: count ?? 0 })
    } catch (err) {
      return serverError('Failed to fetch businesses', err)
    }
  },

  async getById(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const business = await BusinessService.getById(id)
      if (!business) return notFound('Business not found')
      return ok(business)
    } catch (err) {
      return serverError('Failed to fetch business', err)
    }
  },

  async update(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, updateSchema)
    if (error) return error
    try {
      const business = await BusinessService.update(id, data)
      return ok(business)
    } catch (err) {
      return serverError('Failed to update business', err)
    }
  },

  async suspend(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const business = await BusinessService.update(id, { is_suspended: true, is_active: false })
      return ok(business)
    } catch (err) {
      return serverError('Failed to suspend business', err)
    }
  },

  async activate(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const business = await BusinessService.update(id, { is_suspended: false, is_active: true })
      return ok(business)
    } catch (err) {
      return serverError('Failed to activate business', err)
    }
  },

  async getDetails(_request: NextRequest, _ctx: RequestContext, id: string) {
    try {
      const details = await BusinessService.getFullDetails(id)
      if (!details.business) return notFound('Business not found')
      return ok(details)
    } catch (err) {
      return serverError('Failed to fetch business details', err)
    }
  },

  async fixAuthUser(_request: NextRequest, _ctx: RequestContext, id: string) {
    try {
      const result = await BusinessService.fixAuthUser(id)
      return ok(result)
    } catch (err) {
      return serverError('Failed to fix auth user', err)
    }
  },

  async impersonate(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
              ?? request.headers.get('x-real-ip')
              ?? null
      const result = await BusinessService.createImpersonationSession(id, ctx.auth.userId, ip)

      const isProd = process.env.NODE_ENV === 'production'
      const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'repairbooking.co.uk'
      const url = isProd
        ? `https://${result.subdomain}.${rootDomain}/api/auth/impersonate?token=${result.token}`
        : `http://${result.subdomain}.localhost:3000/api/auth/impersonate?token=${result.token}`

      return ok({ url })
    } catch (err) {
      return serverError('Failed to create impersonation session', err)
    }
  },

  async listUsers(_request: NextRequest, _ctx: RequestContext, id: string) {
    try {
      const users = await BusinessService.listUsers(id)
      return ok(users)
    } catch (err) {
      return serverError('Failed to fetch users', err)
    }
  },

  async resetOwnerPassword(request: NextRequest, _ctx: RequestContext, id: string) {
    try {
      const body = await request.json()
      const { newPassword, userId } = body
      if (!newPassword || newPassword.length < 8) {
        return badRequest('Password must be at least 8 characters')
      }
      const result = await BusinessService.resetUserPassword(id, newPassword, userId)
      return ok(result)
    } catch (err) {
      return serverError('Failed to reset password', err)
    }
  },

  async delete(_request: NextRequest, _ctx: RequestContext, id: string) {
    try {
      await BusinessService.delete(id)
      return ok({ deleted: true })
    } catch (err) {
      return serverError('Failed to delete business', err)
    }
  },
}
