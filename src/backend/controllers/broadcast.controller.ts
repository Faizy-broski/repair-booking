import { NextRequest } from 'next/server'
import { z } from 'zod'
import { BroadcastService } from '@/backend/services/broadcast.service'
import { type RequestContext } from '@/backend/middleware'
import { ok, created, badRequest, notFound, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'

const createSchema = z.object({
  type: z.enum(['info', 'warning', 'downtime', 'maintenance']).default('info'),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
  target_scope: z.enum(['all', 'business']).default('all'),
  target_business_id: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'active']).default('draft'),
  expires_at: z.string().datetime().nullable().optional(),
})

const updateSchema = createSchema.partial()

export const BroadcastController = {
  // ── Super-admin handlers ───────────────────────────────────────────────────

  async list(request: NextRequest, ctx: RequestContext) {
    try {
      const url = new URL(request.url)
      const status = url.searchParams.get('status') as 'draft' | 'active' | 'archived' | undefined
      const data = await BroadcastService.listAll(status ?? undefined)
      return ok(data)
    } catch (err) {
      return serverError('Failed to list broadcasts', err)
    }
  },

  async create(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, createSchema)
    if (error) return error
    try {
      // Guard: business-scoped broadcasts require a target_business_id
      if (data.target_scope === 'business' && !data.target_business_id) {
        return badRequest('target_business_id is required when target_scope is "business"')
      }
      const broadcast = await BroadcastService.create({
        ...data,
        created_by: ctx.auth.userId,
        target_business_id: data.target_business_id ?? null,
        expires_at: data.expires_at ?? null,
      })
      return created(broadcast)
    } catch (err) {
      return serverError('Failed to create broadcast', err)
    }
  },

  async update(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, updateSchema)
    if (error) return error
    try {
      const existing = await BroadcastService.getById(id)
      if (!existing) return notFound('Broadcast not found')

      const broadcast = await BroadcastService.update(id, data)
      return ok(broadcast)
    } catch (err) {
      return serverError('Failed to update broadcast', err)
    }
  },

  async publish(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const existing = await BroadcastService.getById(id)
      if (!existing) return notFound('Broadcast not found')
      if (existing.status === 'archived') return badRequest('Cannot publish an archived broadcast')

      const broadcast = await BroadcastService.publish(id)
      return ok(broadcast)
    } catch (err) {
      return serverError('Failed to publish broadcast', err)
    }
  },

  async archive(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const existing = await BroadcastService.getById(id)
      if (!existing) return notFound('Broadcast not found')

      const broadcast = await BroadcastService.archive(id)
      return ok(broadcast)
    } catch (err) {
      return serverError('Failed to archive broadcast', err)
    }
  },

  // ── Tenant-facing handlers ─────────────────────────────────────────────────

  /** GET /api/broadcasts — returns active broadcasts for the calling tenant,
   *  plus the IDs this profile has already read (so client can compute unread count) */
  async listForTenant(request: NextRequest, ctx: RequestContext) {
    try {
      const broadcasts = await BroadcastService.listActiveForBusiness(ctx.businessId)
      const readIds = await BroadcastService.getReadIds(
        ctx.auth.userId,
        broadcasts.map((b) => b.id)
      )
      return ok({ broadcasts, readIds })
    } catch (err) {
      return serverError('Failed to fetch broadcasts', err)
    }
  },

  async markRead(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      await BroadcastService.markRead(id, ctx.auth.userId)
      return ok({ marked: true })
    } catch (err) {
      return serverError('Failed to mark broadcast as read', err)
    }
  },

}
