import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { WorkflowService, RepairStatusFlagService } from '@/backend/services/workflow.service'
import { CannedResponseService } from '@/backend/services/canned-response.service'
import { ok, created, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

const workflowSchema = z.object({
  name:       z.string().min(1),
  is_default: z.boolean().default(false),
})

const stepSchema = z.object({
  name:          z.string().min(1),
  description:   z.string().optional(),
  required_role: z.string().optional(),
  step_order:    z.number().int(),
})

const statusFlagSchema = z.object({
  status:  z.string().min(1),
  message: z.string().min(1),
})

const cannedSchema = z.object({
  title: z.string().min(1),
  body:  z.string().min(1),
  type:  z.enum(['note', 'sms', 'email']).default('note'),
})

// ── Workflows ────────────────────────────────────────────────────────────────

export const WorkflowController = {
  async list(_req: NextRequest, ctx: RequestContext) {
    try {
      return ok(await WorkflowService.list(ctx.businessId))
    } catch (err) {
      return serverError('Failed to fetch workflows', err)
    }
  },

  async create(req: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(req, workflowSchema)
    if (error) return error
    try {
      return created(await WorkflowService.create(ctx.businessId, data.name, data.is_default))
    } catch (err) {
      return serverError('Failed to create workflow', err)
    }
  },

  async update(req: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(req, workflowSchema.partial())
    if (error) return error
    try {
      return ok(await WorkflowService.update(id, ctx.businessId, data.name ?? '', data.is_default ?? false))
    } catch (err) {
      return serverError('Failed to update workflow', err)
    }
  },

  async remove(_req: NextRequest, ctx: RequestContext, id: string) {
    try {
      await WorkflowService.remove(id, ctx.businessId)
      return ok({ id })
    } catch (err) {
      return serverError('Failed to delete workflow', err)
    }
  },

  async setSteps(req: NextRequest, _ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(req, z.object({ steps: z.array(stepSchema) }))
    if (error) return error
    try {
      return ok(await WorkflowService.setSteps(id, data.steps))
    } catch (err) {
      return serverError('Failed to update workflow steps', err)
    }
  },
}

// ── Status Flags ─────────────────────────────────────────────────────────────

export const RepairStatusFlagController = {
  async list(_req: NextRequest, ctx: RequestContext) {
    try {
      return ok(await RepairStatusFlagService.list(ctx.businessId))
    } catch (err) {
      return serverError('Failed to fetch status flags', err)
    }
  },

  async upsert(req: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(req, statusFlagSchema)
    if (error) return error
    try {
      return ok(await RepairStatusFlagService.upsert(ctx.businessId, data.status, data.message))
    } catch (err) {
      return serverError('Failed to save status flag', err)
    }
  },

  async remove(_req: NextRequest, ctx: RequestContext, id: string) {
    try {
      await RepairStatusFlagService.remove(id, ctx.businessId)
      return ok({ id })
    } catch (err) {
      return serverError('Failed to delete status flag', err)
    }
  },
}

// ── Canned Responses ─────────────────────────────────────────────────────────

export const CannedResponseController = {
  async list(req: NextRequest, ctx: RequestContext) {
    const type = req.nextUrl.searchParams.get('type') ?? undefined
    try {
      return ok(await CannedResponseService.list(ctx.businessId, type))
    } catch (err) {
      return serverError('Failed to fetch canned responses', err)
    }
  },

  async create(req: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(req, cannedSchema)
    if (error) return error
    try {
      return created(await CannedResponseService.create(ctx.businessId, data.title, data.body, data.type))
    } catch (err) {
      return serverError('Failed to create canned response', err)
    }
  },

  async update(req: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(req, cannedSchema.partial())
    if (error) return error
    try {
      return ok(await CannedResponseService.update(id, ctx.businessId, data))
    } catch (err) {
      return serverError('Failed to update canned response', err)
    }
  },

  async remove(_req: NextRequest, ctx: RequestContext, id: string) {
    try {
      await CannedResponseService.remove(id, ctx.businessId)
      return ok({ id })
    } catch (err) {
      return serverError('Failed to delete canned response', err)
    }
  },
}
