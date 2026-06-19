import { NextRequest } from 'next/server'
import { z } from 'zod'
import { type RequestContext } from '@/backend/middleware'
import { HelpdeskService } from '@/backend/services/helpdesk.service'
import { getPagination } from '@/backend/utils/pagination'
import { validateBody } from '@/backend/utils/validate'
import { ok, created, noContent, serverError, notFound, forbidden } from '@/backend/utils/api-response'

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
const STATUSES   = ['open', 'in_progress', 'resolved', 'closed'] as const

const createSchema = z.object({
  title:       z.string().min(1).max(300),
  description: z.string().optional().nullable(),
  category:    z.string().min(1),
  priority:    z.enum(PRIORITIES).default('medium'),
  branch_id:   z.string().uuid().optional().nullable(),
})

const updateSchema = z.object({
  title:       z.string().min(1).max(300).optional(),
  description: z.string().optional().nullable(),
  category:    z.string().min(1).optional(),
  priority:    z.enum(PRIORITIES).optional(),
  status:      z.enum(STATUSES).optional(),
})

export const HelpdeskController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const businessId = ctx.businessId
    if (!businessId) return forbidden('No business context')

    const { page, limit } = getPagination(searchParams)
    const status = searchParams.get('status') ?? undefined
    const search = searchParams.get('search') ?? undefined

    try {
      const { data, count } = await HelpdeskService.list(businessId, { page, limit, status, search })
      return ok(data, { page, limit, total: count })
    } catch (err) {
      return serverError('Failed to fetch helpdesk tickets', err)
    }
  },

  async get(request: NextRequest, ctx: RequestContext, { params }: { params: { id: string } }) {
    const businessId = ctx.businessId
    if (!businessId) return forbidden('No business context')

    try {
      const ticket = await HelpdeskService.getById(params.id, businessId)
      return ok(ticket)
    } catch {
      return notFound('Ticket not found')
    }
  },

  async create(request: NextRequest, ctx: RequestContext) {
    const businessId = ctx.businessId
    if (!businessId) return forbidden('No business context')

    const { data, error } = await validateBody(request, createSchema)
    if (error) return error

    try {
      const ticket = await HelpdeskService.create({
        ...data,
        business_id: businessId,
        created_by:  ctx.auth.userId ?? null,
      })
      return created(ticket)
    } catch (err) {
      return serverError('Failed to create ticket', err)
    }
  },

  async update(request: NextRequest, ctx: RequestContext, { params }: { params: { id: string } }) {
    const businessId = ctx.businessId
    if (!businessId) return forbidden('No business context')

    const { data, error } = await validateBody(request, updateSchema)
    if (error) return error

    try {
      const ticket = await HelpdeskService.update(params.id, businessId, data)
      return ok(ticket)
    } catch (err) {
      return serverError('Failed to update ticket', err)
    }
  },

  async delete(request: NextRequest, ctx: RequestContext, { params }: { params: { id: string } }) {
    const businessId = ctx.businessId
    if (!businessId) return forbidden('No business context')

    try {
      await HelpdeskService.delete(params.id, businessId)
      return noContent()
    } catch (err) {
      return serverError('Failed to delete ticket', err)
    }
  },
}
