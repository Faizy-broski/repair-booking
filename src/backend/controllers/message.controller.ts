import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { MessageService } from '@/backend/services/message.service'
import { ok, created, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { getPagination } from '@/backend/utils/pagination'
import { z } from 'zod'

const createSchema = z.object({
  to_branch_id: z.string().uuid().optional().nullable(),
  from_branch_id: z.string().uuid().optional().nullable(), // allow client to pass sender branch
  subject: z.string().optional().nullable(),
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
        sender_id: ctx.auth.userId,
        ...data,
        // Client-supplied from_branch_id wins (covers business owners with no fixed branch),
        // fall back to auth context branch_id
        from_branch_id: data.from_branch_id ?? ctx.auth.branchId ?? null,
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

  async unreadCount(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? undefined
    try {
      const count = await MessageService.unreadCount(ctx.businessId, branchId)
      return ok({ count })
    } catch (err) {
      return serverError('Failed to fetch unread count', err)
    }
  },

  async listUnread(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? undefined
    try {
      const result = await MessageService.listUnread(ctx.businessId, branchId)
      return ok(result)
    } catch (err) {
      return serverError('Failed to fetch unread messages', err)
    }
  },
}
