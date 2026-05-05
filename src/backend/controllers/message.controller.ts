import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { MessageService } from '@/backend/services/message.service'
import { ok, created, serverError, notFound } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { getPagination } from '@/backend/utils/pagination'
import { z } from 'zod'

const attachmentSchema = z.object({
  url:  z.string().url(),
  name: z.string(),
  type: z.string(),
  size: z.number(),
})

const createSchema = z.object({
  to_branch_id:   z.string().uuid().optional().nullable(),
  from_branch_id: z.string().uuid().optional().nullable(),
  subject:        z.string().optional().nullable(),
  body:           z.string().min(0).default(''),
  parent_id:      z.string().uuid().optional().nullable(),
  attachments:    z.array(attachmentSchema).optional().nullable(),
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
    // Require either a non-empty body or at least one attachment
    const hasBody = (data.body ?? '').trim().length > 0
    const hasAttachments = (data.attachments ?? []).length > 0
    if (!hasBody && !hasAttachments) {
      return serverError('Message body or attachment is required', null)
    }
    try {
      const message = await MessageService.send({
        business_id: ctx.businessId,
        sender_id: ctx.auth.userId,
        ...data,
        body: data.body ?? '',
        attachments: data.attachments ?? [],
        from_branch_id: data.from_branch_id ?? ctx.auth.branchId ?? null,
      } as any)
      return created(message)
    } catch (err) {
      return serverError('Failed to send message', err)
    }
  },

  async markRead(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const body = await request.json().catch(() => ({}))
      if (body?.body !== undefined) {
        // Edit message body — only the sender should do this (RLS enforced by adminSupabase)
        await MessageService.updateBody(id, String(body.body))
        return ok({ updated: true })
      }
      await MessageService.markRead(id)
      return ok({ updated: true })
    } catch (err) {
      return serverError('Failed to update message', err)
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
    // active_branch_id is sent by all-branch users (owners/admins) so we can
    // exclude messages they sent from appearing in their own unread list.
    const excludeFromBranchId = request.nextUrl.searchParams.get('active_branch_id') ?? undefined
    try {
      const result = await MessageService.listUnread(ctx.businessId, branchId, excludeFromBranchId)
      return ok(result)
    } catch (err) {
      return serverError('Failed to fetch unread messages', err)
    }
  },

  async deleteThread(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      await MessageService.deleteThread(id, ctx.businessId)
      return ok({ deleted: true })
    } catch (err) {
      return serverError('Failed to delete conversation', err)
    }
  },

  async deleteMessage(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      await MessageService.deleteMessage(id, ctx.businessId)
      return ok({ deleted: true })
    } catch (err) {
      return serverError('Failed to delete message', err)
    }
  },
}
