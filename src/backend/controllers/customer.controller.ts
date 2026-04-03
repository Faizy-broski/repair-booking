import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { CustomerService } from '@/backend/services/customer.service'
import { ok, created, notFound, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { getPagination } from '@/backend/utils/pagination'
import { z } from 'zod'

const createSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  branch_id: z.string().uuid().optional().nullable(),
  custom_fields: z.record(z.string(), z.unknown()).default({}),
})

const updateSchema = createSchema.partial()

export const CustomerController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const { page, limit } = getPagination(searchParams)
    try {
      const { data, count } = await CustomerService.list(ctx.businessId, {
        page,
        limit,
        search: searchParams.get('search') ?? undefined,
      })
      return ok(data, { page, limit, total: count ?? 0 })
    } catch (err) {
      return serverError('Failed to fetch customers', err)
    }
  },

  async getById(request: NextRequest, ctx: RequestContext, id: string) {
    const { searchParams } = request.nextUrl
    const detail = searchParams.get('detail') === 'true'
    try {
      if (detail) {
        const customer = await CustomerService.getDetail(id, ctx.businessId)
        if (!customer) return notFound('Customer not found')
        return ok(customer)
      }
      const customer = await CustomerService.getById(id, ctx.businessId)
      if (!customer) return notFound('Customer not found')
      return ok(customer)
    } catch (err) {
      return serverError('Failed to fetch customer', err)
    }
  },

  async create(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, createSchema)
    if (error) return error
    try {
      const customer = await CustomerService.create({
        ...data,
        business_id: ctx.businessId,
        email: data.email || null,
      })
      return created(customer)
    } catch (err) {
      return serverError('Failed to create customer', err)
    }
  },

  async update(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, updateSchema)
    if (error) return error
    try {
      const customer = await CustomerService.update(id, ctx.businessId, {
        ...data,
        email: data.email || null,
      })
      return ok(customer)
    } catch (err) {
      return serverError('Failed to update customer', err)
    }
  },
}
