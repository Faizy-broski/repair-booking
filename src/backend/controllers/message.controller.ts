import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { MessageService } from '@/backend/services/message.service'
import { ok, created, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { getPagination } from '@/backend/utils/pagination'
import { z } from 'zod'

const createSchema = z.object({
  to_branch_id: z.string().uuid().optional().nullable(),
  subject: z.string().min(1),
  body: z.string().min(1),
  parent_id: z.string().uuid().optional().nullable(),
})

export const MessageController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const { page, limit } = getPagination(searchParams)
    const branchId = ctx.auth.branchId ?? undefined
    try {
      const { data, count } = await MessageService.list(ctx.businessId, { branchId, page, limit })
      return ok(data, { page, limit, total: count ?? 0 })
    } catch (err) {
      return serverError('Failed to fetch messages', err)
    }
  },

  async getThread(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const thread = await MessageService.getThread(id)
      return ok(thread)
    } catch (err) {
      return serverError('Failed to fetch thread', err)
    }
  },

  async create(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, createSchema)
    if (error) return error
    try {
      const message = await MessageService.send({
        business_id: ctx.businessId,
        from_branch_id: ctx.auth.branchId ?? null,
        sender_id: ctx.auth.userId,
        ...data,
      })
      return created(message)
    } catch (err) {
      return serverError('Failed to send message', err)
    }
  },

  async markRead(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      await MessageService.markRead(id)
      return ok({ updated: true })
    } catch (err) {
      return serverError('Failed to mark message as read', err)
    }
  },
}
